/**
 * generate-flags.cjs — Run 7 quality checks on OCR data, output flags JSON.
 *
 * Checks: legibility normalization, GBIF name validation, near-duplicate
 * detection, species count outliers, composite/high-risk, family consistency,
 * internal naming consistency.
 *
 * Requires: data/ocr-labels.json, data/ocr-shadowboxes.json, data/ocr-drawers.json
 * Optional: gbif-data/unique-species.json, gbif-data/enriched-species.json
 *           (if absent, GBIF-dependent checks are skipped)
 *
 * Usage: node generate-flags.cjs [--report]
 *   --report  Also write a human-readable ocr-audit-report.txt
 */

const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'data');
const GBIF = path.join(__dirname, 'gbif-data');
const writeReport = process.argv.includes('--report');

// ── Load OCR data ───────────────────────────────────────────────────────────

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function tryLoadJSON(p) { try { return loadJSON(p); } catch { return null; } }

const labels = loadJSON(path.join(DATA, 'ocr-labels.json'));
const shadowboxes = loadJSON(path.join(DATA, 'ocr-shadowboxes.json'));
const drawers = loadJSON(path.join(DATA, 'ocr-drawers.json'));

const allEntries = [
  ...labels.map(e => ({ ...e, _source: 'labels' })),
  ...shadowboxes.map(e => ({ ...e, _source: 'shadowboxes' })),
  ...drawers.map(e => ({ ...e, _source: 'drawers' })),
];

// GBIF data (optional — enables checks 2, 6)
const uniqueSpecies = tryLoadJSON(path.join(GBIF, 'unique-species.json'));
const enrichedRaw = tryLoadJSON(path.join(GBIF, 'enriched-species.json'));
const gbifCanonical = uniqueSpecies ? new Set(uniqueSpecies.map(s => s.canonicalName)) : null;
const gbifGenera = uniqueSpecies ? new Set(uniqueSpecies.map(s => s.canonicalName.split(' ')[0])) : null;
const enrichedSpecies = enrichedRaw ? enrichedRaw.species : null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function canonicalizeLegibility(raw) {
  if (!raw) return 'none';
  const l = raw.toLowerCase().trim();
  if (/^(high|clear|legible$|good)/.test(l)) return 'high';
  if (/^(medium|moderate|mostly)/.test(l)) return 'medium';
  if (/^(partial|mixed)/.test(l)) return 'partial';
  if (/^(low|poor)/.test(l)) return 'low';
  if (/^(illegible|no.text|no_text|none|n\/a|not.applicable|no readable|no legible)/.test(l)) return 'none';
  if (/illegible|unreadable/.test(l)) return 'none';
  if (/partial|some text|mixed/.test(l)) return 'partial';
  if (/moderate|mostly/.test(l)) return 'medium';
  if (/high|good|clear|legible/.test(l)) return 'high';
  return 'unknown';
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(p * sorted.length), sorted.length - 1)];
}

// ── Flags accumulator ───────────────────────────────────────────────────────

const flags = [];
const flag = (entry, check, severity, message) =>
  flags.push({ imageId: entry.imageId, source: entry._source, check, severity, message });

// ── Check 1: Legibility normalization ───────────────────────────────────────

for (const entry of allEntries) {
  const raw = entry.legibility || '';
  const canonical = canonicalizeLegibility(raw);
  if (!['high', 'partial', 'illegible'].includes(raw)) {
    flag(entry, 'legibility', 'info', `Non-standard legibility "${raw}" -> canonical "${canonical}"`);
  }
}

// ── Check 2: GBIF name validation (skipped without GBIF data) ──────────────

if (gbifCanonical) {
  for (const entry of allEntries) {
    for (const sp of (entry.species || [])) {
      const sci = sp.scientificName;
      if (!sci) continue;
      if (/\d/.test(sci)) {
        flag(entry, 'gbif-name', 'error', `Malformed scientificName contains digits: "${sci}"`);
        continue;
      }
      let clean = sci.replace(/\s*\(.*?\d{4}.*?\)\s*$/, '').trim();
      if (gbifCanonical.has(clean)) continue;
      const words = clean.split(/\s+/);
      if (words.length >= 3 && gbifCanonical.has(words.slice(0, 2).join(' '))) continue;
      if (/\bsp\.?\b/i.test(clean) && gbifGenera.has(words[0])) continue;
      const severity = gbifGenera.has(words[0]) ? 'warning' : 'warning';
      const detail = gbifGenera.has(words[0])
        ? `Genus "${words[0]}" in GBIF but species "${clean}" not found`
        : `"${clean}" not in GBIF (genus "${words[0]}" unknown)`;
      flag(entry, 'gbif-name', severity, detail);
    }
  }
}

// ── Check 3: Near-duplicate detection ───────────────────────────────────────

const genusBuckets = {};
for (const entry of allEntries) {
  for (const sp of (entry.species || [])) {
    if (!sp.scientificName) continue;
    const parts = sp.scientificName.split(/\s+/);
    if (parts.length < 2) continue;
    const [genus, ...rest] = parts;
    const epithet = rest.join(' ');
    if (!genusBuckets[genus]) genusBuckets[genus] = {};
    if (!genusBuckets[genus][epithet]) genusBuckets[genus][epithet] = new Set();
    genusBuckets[genus][epithet].add(entry.imageId);
  }
}

for (const [genus, epithets] of Object.entries(genusBuckets)) {
  const keys = Object.keys(epithets);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const dist = levenshtein(keys[i], keys[j]);
      if (dist > 0 && dist <= 2) {
        const nameA = `${genus} ${keys[i]}`, nameB = `${genus} ${keys[j]}`;
        for (const id of epithets[keys[i]]) {
          const entry = allEntries.find(e => e.imageId === id);
          if (entry) flag(entry, 'near-duplicate', dist === 1 ? 'warning' : 'info',
            `"${nameA}" is ${dist} edit(s) from "${nameB}"`);
        }
      }
    }
  }
}

// ── Check 4: Species count outliers ─────────────────────────────────────────

const countsByType = {};
for (const entry of allEntries) {
  const t = entry.imageType || 'unknown';
  if (!countsByType[t]) countsByType[t] = [];
  countsByType[t].push((entry.species || []).length);
}
const typeP95 = {};
for (const [type, counts] of Object.entries(countsByType)) {
  typeP95[type] = percentile(counts, 0.95);
}

for (const entry of allEntries) {
  const t = entry.imageType || 'unknown';
  const n = (entry.species || []).length;
  if (t === 'blank' && n > 0) {
    flag(entry, 'species-count', 'error', `Blank image has ${n} species — misclassified?`);
  } else if (n > typeP95[t] && n > 0) {
    flag(entry, 'species-count', 'warning', `${n} species for type "${t}" exceeds P95 (${typeP95[t]})`);
  }
}

// ── Check 5: Composite/high-risk detection ──────────────────────────────────

const compositeRx = /composite|multiple panels|adjacent|multi-panel|spanning multiple/i;
const knownComposite = new Set(['DI.05', 'DI.18']);

for (const entry of allEntries) {
  if (compositeRx.test(entry.notes || ''))
    flag(entry, 'composite', 'info', 'Notes mention composite/multi-panel content');
  if (knownComposite.has(entry.location) && entry._source === 'drawers')
    flag(entry, 'composite', 'info', `In ${entry.location} (known composite-prone folder)`);
  if (entry._source === 'shadowboxes' && entry.imagePath?.includes('archive')) {
    const pathId = entry.imagePath.match(/s(\d+)/i);
    if (pathId && entry.location && !entry.location.toLowerCase().includes(pathId[1]))
      flag(entry, 'composite', 'warning', `Archive shadowbox: path suggests ${pathId[0]} but location is "${entry.location}"`);
  }
}

// ── Check 6: Family consistency (skipped without enriched data) ─────────────

if (enrichedSpecies) {
  for (const entry of allEntries) {
    if (!entry.familyName) continue;
    for (const sp of (entry.species || [])) {
      if (!sp.scientificName) continue;
      const clean = sp.scientificName.replace(/\s*\(.*?\d{4}.*?\)\s*$/, '').trim();
      const gbif = enrichedSpecies[clean];
      if (gbif?.family && gbif.family.toLowerCase() !== entry.familyName.toLowerCase()) {
        flag(entry, 'family', 'warning',
          `"${clean}" belongs to ${gbif.family} per GBIF, but image says "${entry.familyName}"`);
      }
    }
  }
}

// ── Check 7: Internal consistency ───────────────────────────────────────────

const commonToSci = {};
for (const entry of allEntries) {
  for (const sp of (entry.species || [])) {
    if (sp.scientificName && sp.commonName) {
      const key = sp.commonName.toLowerCase().trim();
      if (!commonToSci[key]) commonToSci[key] = new Set();
      commonToSci[key].add(sp.scientificName);
    }
  }
}
for (const [common, sciSet] of Object.entries(commonToSci)) {
  if (sciSet.size <= 1) continue;
  const names = [...sciSet];
  for (const entry of allEntries) {
    for (const sp of (entry.species || [])) {
      if (sp.commonName?.toLowerCase().trim() === common && sp.scientificName) {
        flag(entry, 'consistency', 'warning',
          `Common name "${common}" maps to multiple scientific names: ${names.join(', ')}`);
        break;
      }
    }
  }
}

// ── Output ──────────────────────────────────────────────────────────────────

const grouped = {};
for (const f of flags) {
  if (!grouped[f.imageId]) grouped[f.imageId] = { imageId: f.imageId, source: f.source, flags: [] };
  grouped[f.imageId].flags.push({ check: f.check, severity: f.severity, message: f.message });
}

fs.writeFileSync(
  path.join(DATA, 'ocr-audit-flags.json'),
  JSON.stringify(Object.values(grouped), null, 2)
);

const errors = flags.filter(f => f.severity === 'error').length;
const warnings = flags.filter(f => f.severity === 'warning').length;
const infos = flags.filter(f => f.severity === 'info').length;
const flagged = new Set(flags.map(f => f.imageId)).size;

console.log(`Entries: ${allEntries.length} (${labels.length} labels, ${shadowboxes.length} shadowboxes, ${drawers.length} drawers)`);
console.log(`Flags:   ${flags.length} total (${errors} errors, ${warnings} warnings, ${infos} info)`);
console.log(`         ${flagged} / ${allEntries.length} entries flagged`);
if (!gbifCanonical) console.log('Note: GBIF data not found — checks 2 & 6 skipped. Place unique-species.json and enriched-species.json in gbif-data/ to enable.');
console.log(`\nWrote data/ocr-audit-flags.json`);

// ── Optional report ─────────────────────────────────────────────────────────

if (writeReport) {
  const lines = [];
  const line = (s = '') => lines.push(s);
  line('=== OCR Quality Audit Report ===');
  line(`Generated: ${new Date().toISOString()}`);
  line(`Entries: ${allEntries.length} | Flags: ${flags.length} (${errors} errors, ${warnings} warnings, ${infos} info)`);
  line('');

  const actionable = flags.filter(f => f.severity !== 'info');
  const byId = {};
  for (const f of actionable) {
    if (!byId[f.imageId]) byId[f.imageId] = [];
    byId[f.imageId].push(f);
  }
  const sorted = Object.keys(byId).sort((a, b) => {
    const ae = byId[a].some(f => f.severity === 'error') ? 0 : 1;
    const be = byId[b].some(f => f.severity === 'error') ? 0 : 1;
    return ae - be || a.localeCompare(b);
  });

  line('--- Actionable Flags (errors + warnings) ---');
  line('');
  for (const id of sorted) {
    line(`  [${byId[id][0].source}] ${id}:`);
    for (const f of byId[id]) line(`    ${f.severity.toUpperCase()}: [${f.check}] ${f.message}`);
  }
  line('');
  line(`Total: ${actionable.length} flags across ${sorted.length} entries`);

  fs.writeFileSync(path.join(__dirname, 'ocr-audit-report.txt'), lines.join('\n'));
  console.log('Wrote ocr-audit-report.txt');
}
