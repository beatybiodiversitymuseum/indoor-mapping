# Beaty Museum Floor Database

A searchable visual database of everything currently on display at the [Beaty Biodiversity Museum](https://beatymuseum.ubc.ca/) — labels, shadowboxes, and specimen drawers.

Built from OCR extractions of 1,503 exhibit images covering 2,378 species records.

## Quick Start

Serve the directory with any static file server:

```bash
# Python
python -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

> **Note:** Opening `index.html` directly (file://) won't work because the viewer loads JSON data via `fetch()`, which requires HTTP.

## Features

- **Search** across image IDs, species names, locations, families, catalog numbers
- **Filter** by source (labels / shadowboxes / drawers), image type, legibility, flag severity
- **Sort** by ID, flag count, severity, or species count
- **Paginate** with configurable page size (25–200)
- **Zoom** images with click (Escape to close)
- **Audit flags** — 7 automated quality checks highlight potential data issues
- **Keyboard navigation** — arrow keys for pagination

## Data Files

| File | Records | Description |
|------|---------|-------------|
| `data/ocr-labels.json` | 1,167 | Cabinet face label images |
| `data/ocr-shadowboxes.json` | 127 | Shadowbox display images |
| `data/ocr-drawers.json` | 209 | Discovery drawer images |
| `data/ocr-audit-flags.json` | — | Pre-computed quality flags |

Images load from `explore.beatymuseum.ubc.ca`. The `IMAGE_BASE` constant at the top of `index.html` can be changed if images move.

## Regenerating Flags

If you update the OCR data and want to regenerate flags:

```bash
node generate-flags.cjs
```

For a human-readable report:

```bash
node generate-flags.cjs --report
```

GBIF-dependent checks (name validation, family consistency) require `gbif-data/unique-species.json` and `gbif-data/enriched-species.json`. Without them, those checks are skipped gracefully.

## Audit Checks

1. **Legibility normalization** — canonicalizes free-text legibility values
2. **GBIF name validation** — matches scientific names against GBIF taxonomy
3. **Near-duplicate detection** — Levenshtein distance within genus
4. **Species count outliers** — flags entries exceeding P95 per image type
5. **Composite/high-risk** — detects multi-panel content
6. **Family consistency** — validates family names against GBIF
7. **Internal consistency** — finds naming conflicts across entries
