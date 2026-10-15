#!/usr/bin/env python3
"""Inventory public exhibit images and queue safe, per-image review decisions.

No map data is modified. Byte hashes and OCR are evidence, never an approval.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

BASE = "https://explore.beatymuseum.ubc.ca/docs/"
COLLECTIONS = ("labels", "windows", "shadowboxes", "drawers")
IMAGE_EXT = re.compile(r"\.(?:jpe?g|png|webp)$", re.I)


class ImageLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.href = None
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "a":
            self.href = values.get("href")
            self.depth += 1
        elif tag == "img" and self.href and IMAGE_EXT.search(urlparse(self.href).path):
            self.links.append((self.href, values.get("alt", "")))

    def handle_endtag(self, tag):
        if tag == "a":
            self.depth = max(0, self.depth - 1)
            if self.depth == 0:
                self.href = None


def read_url(url):
    request = Request(url, headers={"User-Agent": "indoor-mapping-image-audit/1", "Cache-Control": "no-cache"})
    with urlopen(request, timeout=40) as response:
        return response.read(), dict(response.headers)


def inventory(collection, html):
    parser = ImageLinks()
    parser.feed(html)
    root = BASE + collection + "/"
    result = {}
    for href, alt in parser.links:
        url = urljoin(root, href)
        path = urlparse(url).path
        if "/docs/" + collection + "/" not in path or not IMAGE_EXT.search(path):
            continue
        if re.search(r"(?:-sm|sml|thumb)\.(?:jpe?g|png|webp)$", path, re.I):
            continue
        result[url] = {"collection": collection, "url": url, "relative_path": path.split("/docs/", 1)[1], "alt": alt}
    return list(result.values())


def codes(item):
    collection = item["collection"]
    stem = Path(urlparse(item["url"]).path).stem
    if collection == "labels":
        face = re.search(r"Face(\d+)", item["relative_path"], re.I)
        if not face:
            return []
        prefix = str(int(face.group(1)))
        return [prefix + "." + str(int(n)) for n in re.findall(r"\d+", stem)]
    if collection == "windows":
        m = re.match(r"(\d+)[-_.](\d+)", stem)
        return [str(int(m.group(1))) + "." + str(int(m.group(2)))] if m else []
    if collection in ("shadowboxes", "drawers"):
        return [stem.lower()]
    return []


def feature_codes(props):
    archive = props.get("archive") or {}
    result = set()
    for value in (archive.get("public_reference_code"), archive.get("id")):
        if value:
            result.add(str(value).lower())
            m = re.fullmatch(r"0*(\d+)\.0*(\d+)", str(value))
            if m:
                result.add(str(int(m.group(1))) + "." + str(int(m.group(2))))
    return result


def map_image_url(props):
    image = props.get("image") or {}
    return image.get("url") or (urljoin(BASE, image["path"]) if image.get("path") else None)


def match_sources(features, sources):
    by_path = defaultdict(list)
    by_code = defaultdict(list)
    for item in sources:
        by_path[item["relative_path"].lower()].append(item)
        for code in codes(item):
            by_code[item["collection"], code.lower()].append(item)
    rows = []
    for feature in features:
        props = feature.get("properties") or {}
        archive = props.get("archive") or {}
        image = props.get("image") or {}
        collection = archive.get("collection") or ("windows" if image.get("type") == "window" else None)
        if collection not in COLLECTIONS:
            continue
        path = image.get("path", "").lower()
        exact = by_path.get(path, []) if path else []
        candidates = exact or list({item["url"]: item for code in feature_codes(props) for item in by_code.get((collection, code), [])}.values())
        rows.append({"feature_id": feature.get("id"), "name": (props.get("name") or {}).get("en"),
                     "collection": collection, "reference_code": archive.get("public_reference_code"),
                     "current_url": map_image_url(props), "text_source_url": props.get("photo_text_source_url"),
                     "match_basis": "exact_path" if exact else ("reference_code" if candidates else "none"),
                     "source_urls": sorted(item["url"] for item in candidates),
                     "status": "unmatched" if not candidates else ("ambiguous" if len(candidates) > 1 else "pending_comparison")})
    return rows


def cached_image(url, cache, refresh=False):
    key = hashlib.sha256(url.encode()).hexdigest()
    suffix = Path(urlparse(url).path).suffix.lower()
    path = cache / key[:2] / (key + (suffix if IMAGE_EXT.search(suffix) else ".jpg"))
    meta_path = path.with_suffix(".json")
    if refresh or not path.exists():
        data, headers = read_url(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        meta_path.write_text(json.dumps({"url": url, "last_modified": headers.get("Last-Modified"),
                                         "content_type": headers.get("Content-Type")}, indent=2) + "\n")
    data = path.read_bytes()
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    result = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
              "http_last_modified": meta.get("last_modified"), "cache_path": str(path)}
    try:
        from PIL import Image, ImageStat
        with Image.open(path) as image:
            result["dimensions"] = [image.width, image.height]
            result["pixels"] = image.width * image.height
            gray = image.convert("L")
            result["grayscale_stddev"] = round(ImageStat.Stat(gray).stddev[0], 2)
            exif = image.getexif()
            if exif.get(306):
                result["exif_datetime"] = str(exif[306])
    except (ImportError, OSError):
        pass
    return result


def ocr(path):
    run = subprocess.run(["tesseract", "stdin", "stdout", "--psm", "11"], input=Path(path).read_bytes(),
                         capture_output=True, check=True)
    return run.stdout.decode("utf-8", "replace").strip()


def visual_similarity(first_path, second_path):
    """Low resolution full/crop comparison for triage, never identity proof."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return None
    with Image.open(first_path) as first_file, Image.open(second_path) as second_file:
        first = ImageOps.exif_transpose(first_file).convert("L")
        second = ImageOps.exif_transpose(second_file).convert("L")

    def variants(image):
        w, h = image.size
        return {"full": image, "left_half": image.crop((0, 0, w // 2, h)),
                "right_half": image.crop((w // 2, 0, w, h)),
                "top_half": image.crop((0, 0, w, h // 2)),
                "bottom_half": image.crop((0, h // 2, w, h))}

    def pixels(image):
        return list(ImageOps.fit(image, (32, 32)).getdata())

    a = {name: pixels(image) for name, image in variants(first).items()}
    b = {name: pixels(image) for name, image in variants(second).items()}
    scores = [(round(1 - sum(abs(x - y) for x, y in zip(left, right)) / (255 * len(left)), 3),
               left_name, right_name)
              for left_name, left in a.items() for right_name, right in b.items()
              if left_name == "full" or right_name == "full"]
    best = max(scores)
    return {"score": best[0], "current_crop": best[1], "source_crop": best[2],
            "method": "32x32 grayscale mean absolute similarity; review ranking only"}


def ocr_overlap(first, second):
    a = set(re.findall(r"[a-z]{3,}", first.lower()))
    b = set(re.findall(r"[a-z]{3,}", second.lower()))
    return round(len(a & b) / len(a | b), 3) if a or b else None


def flag_identity_conflicts(rows):
    """Flag cross-record OCR matches; codes alone cannot establish image identity."""
    measured = [row for row in rows if row.get("current_image", {}).get("ocr_raw") is not None
                and row.get("source_image", {}).get("ocr_raw") is not None]
    for row in measured:
        current = row["current_image"]["ocr_raw"]
        tokens = set(re.findall(r"[a-z]{3,}", current.lower()))
        same = ocr_overlap(current, row["source_image"]["ocr_raw"]) or 0
        alternatives = []
        for other in measured:
            if other is row or other["collection"] != row["collection"]:
                continue
            source_tokens = set(re.findall(r"[a-z]{3,}", other["source_image"]["ocr_raw"].lower()))
            shared = len(tokens & source_tokens)
            score = ocr_overlap(current, other["source_image"]["ocr_raw"]) or 0
            if shared >= 2 and score >= 0.5 and score >= same + 0.25:
                alternatives.append((score, shared, other))
        if alternatives:
            score, shared, other = max(alternatives, key=lambda item: (item[0], item[1]))
            row["possible_source_code"] = other.get("reference_code")
            row["possible_source_url"] = other["source_urls"][0]
            row["identity_evidence"] = f"Current OCR overlaps source {other.get('reference_code')} by {shared} tokens (Jaccard {score}); own-code overlap {same}"
            row["status"] = "identity_conflict"
        elif len(tokens) >= 5 and len(set(re.findall(r"[a-z]{3,}", row["source_image"]["ocr_raw"].lower()))) >= 5 and same < 0.1:
            row["identity_evidence"] = "Current and same-code source OCR have little overlap; identity needs visual review"
            row["status"] = "identity_unverified"


def compare(row, cache, refresh, with_ocr):
    if len(row["source_urls"]) != 1:
        return
    source = row["source_urls"][0]
    current = row["current_url"]
    row["source_image"] = cached_image(source, cache, refresh)
    if current:
        try:
            row["current_image"] = row["source_image"] if current == source else cached_image(current, cache, refresh)
        except OSError as error:
            row["current_image_error"] = str(error)
    if with_ocr:
        for role in ("source", "current"):
            image = row.get(role + "_image")
            if image:
                image["ocr_raw"] = ocr(image["cache_path"])
                image["ocr_engine"] = "Tesseract psm 11 (unreviewed)"
    if row.get("current_image") and current != source:
        row["visual_similarity"] = visual_similarity(row["current_image"]["cache_path"],
                                                       row["source_image"]["cache_path"])
        if with_ocr:
            row["ocr_token_overlap"] = ocr_overlap(row["current_image"].get("ocr_raw", ""),
                                                     row["source_image"].get("ocr_raw", ""))
    if current and "current_image" not in row:
        row["status"] = "current_unavailable"
    elif current == source:
        row["status"] = "same_url"
    elif current and row["current_image"]["sha256"] == row["source_image"]["sha256"]:
        row["status"] = "same_bytes"
    else:
        row["status"] = "review_needed"
    if row.get("text_source_url") and row["text_source_url"] != current:
        row["text_provenance_warning"] = "Reviewed text source differs from current image URL"


def markdown(rows, source_count):
    out = ["# Public exhibit image audit", "", "Image and text decisions are independent. Checkboxes record a future human decision; this audit changes no map data.", "",
           "Source links found: " + ", ".join(f"{k} {v}" for k, v in sorted(source_count.items())), "",
           "HTTP and EXIF dates are clues, not proof of exhibit freshness. OCR below is unreviewed evidence.", ""]
    groups = defaultdict(list)
    for row in rows:
        groups[row["status"]].append(row)
    out.extend(["Map records: " + ", ".join(f"{status} {len(items)}" for status, items in sorted(groups.items())),
                "", "Pending comparisons and identical files are listed in the JSON report.", ""])
    for status in ("identity_conflict", "identity_unverified", "review_needed", "current_unavailable", "ambiguous", "unmatched", "error"):
        subset = groups.get(status, [])
        if not subset:
            continue
        out.extend([f"## {status.replace('_', ' ').title()} ({len(subset)})", ""])
        for row in subset:
            title = row.get("name") or row.get("reference_code") or row["feature_id"]
            out.append(f"### {title} · {row['feature_id']}")
            out.append("")
            if row.get("current_image_error"):
                out.append("Current image fetch failed: " + row["current_image_error"])
                out.append("")
            if row.get("source_changed_since_previous_audit"):
                out.append("Source bytes changed since previous audit at the same URL.")
                out.append("")
            if row.get("identity_evidence"):
                out.append("**Identity warning:** " + row["identity_evidence"])
                out.append("")
                if row.get("possible_source_url"):
                    out.append(f"Possible matching source: {row['possible_source_code']} · {row['possible_source_url']}")
                    out.append("")
            out.append(f"Current: {row.get('current_url') or '(none)'}")
            out.append("")
            out.append("Source: " + (", ".join(row["source_urls"]) or "(no match)"))
            out.append("")
            if row.get("current_url") and len(row["source_urls"]) == 1 and status in ("identity_conflict", "identity_unverified", "review_needed", "current_unavailable"):
                out.extend(["| Current map image | Public source image |", "| --- | --- |",
                            f"| ![Current image]({row['current_url']}) | ![Public source image]({row['source_urls'][0]}) |", ""])
            for role in ("current", "source"):
                image = row.get(role + "_image")
                if image:
                    out.append(f"{role.title()} evidence: {image.get('dimensions', 'unknown size')} px; SHA-256 {image['sha256']}; HTTP modified {image.get('http_last_modified') or 'unknown'}; EXIF {image.get('exif_datetime') or 'unknown'}")
                    out.append("")
            if row.get("visual_similarity"):
                out.append("Visual review rank: " + json.dumps(row["visual_similarity"]))
                out.append("")
            if row.get("ocr_token_overlap") is not None:
                out.append(f"Raw OCR token overlap: {row['ocr_token_overlap']}")
                out.append("")
            if status in ("identity_conflict", "identity_unverified", "review_needed", "current_unavailable", "ambiguous"):
                if status in ("identity_conflict", "identity_unverified"):
                    out.extend(["- [ ] Verify which exhibit each image depicts", ""])
                out.extend(["- [ ] Use current image for display", "- [ ] Use source image for display", "- [ ] Use current/detail image for OCR evidence", "- [ ] Use source image for OCR evidence", "- [ ] Review and update searchable text to match approved display image", ""])
    return "\n".join(out) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--geojson", default="geojson/exhibit.geojson")
    parser.add_argument("--html-dir", help="Read labels.html, windows.html, shadowboxes.html, drawers.html from this directory")
    parser.add_argument("--cache", default="/tmp/indoor-public-image-audit")
    parser.add_argument("--output", default="reports/public-image-audit.json")
    parser.add_argument("--markdown", default="reports/public-image-audit.md")
    parser.add_argument("--collection", choices=COLLECTIONS, action="append")
    parser.add_argument("--fetch-images", action="store_true", help="Download matched full images for hashes and dimensions")
    parser.add_argument("--limit", type=int, default=50, help="Maximum matched records to compare per run; 0 means all")
    parser.add_argument("--refresh", action="store_true", help="Refetch image bytes even when cached")
    parser.add_argument("--previous", help="Previous JSON audit; flag source byte changes at the same URL")
    parser.add_argument("--ocr", action="store_true", help="OCR compared images with local Tesseract")
    args = parser.parse_args()
    if args.ocr and not args.fetch_images:
        parser.error("--ocr requires --fetch-images")
    cache = Path(args.cache)
    sources = []
    for collection in args.collection or COLLECTIONS:
        url = BASE + collection + "/"
        html = ((Path(args.html_dir) / (collection + ".html")).read_text() if args.html_dir
                else read_url(url)[0].decode("utf-8", "replace"))
        sources.extend(inventory(collection, html))
    features = json.loads(Path(args.geojson).read_text())["features"]
    rows = match_sources(features, sources)
    previous = {}
    if args.previous:
        for old in json.loads(Path(args.previous).read_text()).get("rows", []):
            if len(old.get("source_urls", [])) == 1 and old.get("source_image", {}).get("sha256"):
                previous[old["source_urls"][0]] = old["source_image"]["sha256"]
    errors = 0
    if args.fetch_images:
        eligible = [row for row in rows if len(row["source_urls"]) == 1]
        eligible.sort(key=lambda row: (not (row["current_url"] or "").startswith("https://github.com/"),
                                       row["current_url"] == row["source_urls"][0], row["collection"], row.get("reference_code") or ""))
        for row in eligible[:args.limit or None]:
            try:
                compare(row, cache, args.refresh, args.ocr)
                prior_hash = previous.get(row["source_urls"][0])
                if prior_hash and prior_hash != row["source_image"]["sha256"]:
                    row["source_changed_since_previous_audit"] = True
                    row["previous_source_sha256"] = prior_hash
                    row["status"] = "review_needed"
            except (OSError, subprocess.CalledProcessError) as error:
                row["status"] = "error"
                row["error"] = str(error)
                errors += 1
        if args.ocr:
            flag_identity_conflicts(rows)
    counts = Counter(item["collection"] for item in sources)
    report = {"generated_at_utc": datetime.now(timezone.utc).isoformat(), "sources": sources,
              "source_counts": dict(counts), "rows": rows, "status_counts": dict(Counter(row["status"] for row in rows)),
              "notes": ["No map changes applied", "HTTP Last-Modified and EXIF dates do not prove exhibit recency", "OCR is unreviewed"]}
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    Path(args.markdown).parent.mkdir(parents=True, exist_ok=True)
    Path(args.markdown).write_text(markdown(rows, counts))
    print(json.dumps({"sources": dict(counts), "statuses": report["status_counts"], "errors": errors,
                      "json": args.output, "markdown": args.markdown}))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
