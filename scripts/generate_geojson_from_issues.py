#!/usr/bin/env python3
"""Generate candidate GeoJSON features from GitHub location issues."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path


BASEMENT_LEVEL_ID = "41d0e8ca-d315-4b25-938c-7955db2daf2e"
ISSUE_NAMESPACE = uuid.UUID("5a177f54-c265-5ddf-84ec-8eb4d9e6b313")
UBC_BOUNDS = {
    "west": -123.2705,
    "south": 49.2460,
    "east": -123.2250,
    "north": 49.2820,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--issues", required=True, help="JSON from gh issue list")
    parser.add_argument("--geojson-dir", default="geojson")
    parser.add_argument("--report", default="reports/issue-geojson-review.md")
    parser.add_argument("--default-level-id", default=os.environ.get("DEFAULT_LEVEL_ID", BASEMENT_LEVEL_ID))
    parser.add_argument("--default-unit-id", default=os.environ.get("DEFAULT_UNIT_ID", ""))
    parser.add_argument("--default-amenity-category", default=os.environ.get("DEFAULT_AMENITY_CATEGORY", "service"))
    parser.add_argument("--bounds-west", type=float, default=float(os.environ.get("UBC_BOUNDS_WEST", UBC_BOUNDS["west"])))
    parser.add_argument("--bounds-south", type=float, default=float(os.environ.get("UBC_BOUNDS_SOUTH", UBC_BOUNDS["south"])))
    parser.add_argument("--bounds-east", type=float, default=float(os.environ.get("UBC_BOUNDS_EAST", UBC_BOUNDS["east"])))
    parser.add_argument("--bounds-north", type=float, default=float(os.environ.get("UBC_BOUNDS_NORTH", UBC_BOUNDS["north"])))
    return parser.parse_args()


def load_json(path: Path) -> object:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data: object) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def labels_for(issue: dict) -> set[str]:
    return {label.get("name", "").lower() for label in issue.get("labels", [])}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return slug or "issue_location"


def issue_url(issue: dict) -> str:
    return issue.get("url") or f"https://github.com/issues/{issue.get('number')}"


def candidate_id(issue: dict, layer: str) -> str:
    return str(uuid.uuid5(ISSUE_NAMESPACE, f"{issue_url(issue)}#{layer}"))


def section(body: str, heading_number: int) -> str:
    pattern = re.compile(
        rf"^##\s+{heading_number}\.\s+.*?$([\s\S]*?)(?=^---\s*$|^##\s+\d+\.|^#\s+Optional:|\Z)",
        re.MULTILINE,
    )
    match = pattern.search(body or "")
    return match.group(1).strip() if match else ""


def first_fenced_text(text: str) -> str:
    match = re.search(r"```(?:text|json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if not match:
        return text.strip()
    return match.group(1).strip()


def checked_items(text: str) -> list[str]:
    items = []
    for match in re.finditer(r"^\s*-\s+\[[xX]\]\s+(.+?)\s*$", text, re.MULTILINE):
        items.append(match.group(1).strip())
    return items


def optional_geojson_feature(body: str) -> dict | None:
    marker = re.search(r"^#\s+Optional:\s+pasted GeoJSON feature", body or "", re.IGNORECASE | re.MULTILINE)
    search_area = body[marker.start() :] if marker else body or ""
    matches = list(re.finditer(r"```json\s*([\s\S]*?)```", search_area, re.IGNORECASE))
    for match in matches:
        raw = match.group(1).strip()
        if not raw:
            continue
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and value.get("type") == "Feature":
            return value
    return None


def coordinates_from_body(body: str) -> tuple[float, float] | None:
    gps = first_fenced_text(section(body, 4))
    lat_match = re.search(r"Latitude:\s*(-?\d+(?:\.\d+)?)", gps, re.IGNORECASE)
    lon_match = re.search(r"Longitude:\s*(-?\d+(?:\.\d+)?)", gps, re.IGNORECASE)
    if lat_match and lon_match:
        return float(lon_match.group(1)), float(lat_match.group(1))

    pair_match = re.search(
        r"\b(?:lat(?:itude)?)[^\d-]*(-?\d+(?:\.\d+)?)[,\s]+(?:lon(?:gitude)?|lng)[^\d-]*(-?\d+(?:\.\d+)?)",
        gps,
        re.IGNORECASE,
    )
    if pair_match:
        return float(pair_match.group(2)), float(pair_match.group(1))

    raw_pair = re.search(r"(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)", gps)
    if raw_pair:
        return float(raw_pair.group(2)), float(raw_pair.group(1))
    return None


def valid_point(coordinates: object) -> bool:
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return False
    lon, lat = coordinates[0], coordinates[1]
    return isinstance(lon, (int, float)) and isinstance(lat, (int, float)) and -180 <= lon <= 180 and -90 <= lat <= 90


def geometry_points(geometry: dict) -> list[list[float]]:
    coordinates = geometry.get("coordinates")
    kind = geometry.get("type")
    if kind == "Point":
        return [coordinates] if valid_point(coordinates) else []
    if kind == "LineString" and isinstance(coordinates, list):
        return coordinates if len(coordinates) >= 2 and all(valid_point(point) for point in coordinates) else []
    if kind == "Polygon" and isinstance(coordinates, list) and coordinates:
        points = [point for ring in coordinates if isinstance(ring, list) for point in ring]
        return points if points and all(valid_point(point) for point in points) else []
    return []


def in_bounds(coordinates: tuple[float, float] | list[float], args: argparse.Namespace) -> bool:
    lon, lat = coordinates[0], coordinates[1]
    return args.bounds_west <= lon <= args.bounds_east and args.bounds_south <= lat <= args.bounds_north


def bounds_message(coordinates: tuple[float, float] | list[float], args: argparse.Namespace) -> str:
    lon, lat = coordinates[0], coordinates[1]
    return (
        f"point {lon}, {lat} is outside UBC Vancouver bounds "
        f"({args.bounds_west}, {args.bounds_south}, {args.bounds_east}, {args.bounds_north})"
    )


def layer_for(issue: dict, feature: dict | None) -> str:
    if feature:
        feature_type = str(feature.get("feature_type") or feature.get("properties", {}).get("feature_type") or "").lower()
        if feature_type in {"amenity", "opening", "exhibit", "fixture"}:
            return feature_type
    issue_labels = labels_for(issue)
    requested_layers = issue_labels & {"amenity", "opening", "exhibit", "fixture"}
    if len(requested_layers) == 1:
        return requested_layers.pop()
    layer_section = section(issue.get("body") or "", 2)
    for item in checked_items(layer_section):
        layer = item.split("—", 1)[0].split("-", 1)[0].strip().lower()
        if layer in {"amenity", "opening", "exhibit", "fixture"}:
            return layer
    title = re.sub(r"^(?:amenity or opening|location):\s*", "", issue.get("title", ""), flags=re.IGNORECASE)
    location_name = first_fenced_text(section(issue.get("body") or "", 1))
    text = f"{title}\n{location_name}".lower()
    if "opening" in issue_labels or re.search(r"\b(openings?|doors?|entrances?|exits?)\b", text):
        return "opening"
    if re.search(r"\b(cabinets?|drawers?|tables?|screens?|booths?|fixtures?)\b", text):
        return "fixture"
    if re.search(r"\b(exhibits?|windows?|artworks?|displays?|skeletons?|skulls?|timelines?|plaques?|posters?|photos?)\b", text):
        return "exhibit"
    return "amenity"


def has_layer_section(body: str) -> bool:
    return any(item.split("—", 1)[0].split("-", 1)[0].strip().lower() in {"amenity", "opening", "exhibit", "fixture"} for item in checked_items(section(body, 2)))


def common_properties(issue: dict, body: str) -> dict:
    offset = 1 if has_layer_section(body) else 0
    confirmation = section(body, 2 + offset)
    return {
        "source": "GitHub issue",
        "source_url": issue_url(issue),
        "source_issue_number": issue.get("number"),
        "source_issue_title": issue.get("title"),
        "confirmation_methods": checked_items(confirmation),
        "confirmation_details": first_fenced_text(confirmation.split("Details:", 1)[-1]) if "Details:" in confirmation else "",
        "reference_points": first_fenced_text(section(body, 3 + offset)),
        "contributor_notes": first_fenced_text(section(body, 5 + offset)),
    }


def default_properties(issue: dict, body: str, layer: str, args: argparse.Namespace) -> dict | str:
    name = first_fenced_text(section(body, 1)) or re.sub(r"^(?:Amenity or Opening|Location):\s*", "", issue.get("title", ""), flags=re.IGNORECASE).strip()
    if not name:
        return "missing location name"

    categories = {"opening": "pedestrian", "exhibit": "exhibit", "fixture": "furniture", "amenity": args.default_amenity_category}
    props = {
        "category": categories[layer],
        "accessibility": None,
        "name": {"en": name},
        "alt_name": {"en": slugify(name)},
        "level_id": args.default_level_id,
        "correlation_id": None,
        "local_category": f"issue_submitted_{layer}",
        "pedestrian_importance": True,
        "visible_to_visitors": None,
    }
    if layer == "amenity":
        props.update(
            {
                "hours": None,
                "phone": None,
                "website": None,
                "unit_ids": [args.default_unit_id] if args.default_unit_id else [],
                "address_id": None,
            }
        )
    elif layer == "exhibit":
        props.update({"duration_type": "permanent", "exhibit_type": "display", "fixture_ids": [], "navigation_point_ids": [], "stopping_point_ids": []})
    elif layer == "fixture":
        props.update({"unit_ids": [args.default_unit_id] if args.default_unit_id else []})
    return props


def build_feature(issue: dict, args: argparse.Namespace) -> tuple[str | None, dict | str]:
    body = issue.get("body") or ""
    pasted = optional_geojson_feature(body)
    layer = layer_for(issue, pasted)

    if pasted:
        geometry = pasted.get("geometry") or {}
        allowed_geometry = {"amenity": {"Point"}, "exhibit": {"Point"}, "opening": {"Point", "LineString"}, "fixture": {"Point", "LineString", "Polygon"}}
        points = geometry_points(geometry)
        if geometry.get("type") not in allowed_geometry[layer] or not points:
            return None, f"pasted GeoJSON has invalid geometry for {layer}"
        outside = next((point for point in points if not in_bounds(point, args)), None)
        if outside:
            return None, bounds_message(outside, args)
        feature = pasted
        feature["id"] = feature.get("id") or candidate_id(issue, layer)
        feature["feature_type"] = layer
        feature.setdefault("properties", {})
        defaults = default_properties(issue, body, layer, args)
        if isinstance(defaults, str):
            return None, defaults
        defaults.update(feature["properties"])
        defaults.update(common_properties(issue, body))
        feature["properties"] = defaults
        return layer, feature

    coords = coordinates_from_body(body)
    if coords is None:
        return None, "no usable latitude/longitude found"
    if not in_bounds(coords, args):
        return None, bounds_message(coords, args)

    props = default_properties(issue, body, layer, args)
    if isinstance(props, str):
        return None, props
    props.update(common_properties(issue, body))

    return layer, {
        "id": candidate_id(issue, layer),
        "type": "Feature",
        "feature_type": layer,
        "geometry": {"type": "Point", "coordinates": [coords[0], coords[1]]},
        "properties": props,
    }


def accepted_feature_exists(collections: dict[str, dict], issue_number: int | None) -> bool:
    if issue_number is None:
        return False
    for collection in collections.values():
        for feature in collection.get("features", []):
            properties = feature.get("properties", {})
            if properties.get("source_issue_number") == issue_number:
                return True
    return False


def remove_stale_pr_status(collection: dict) -> bool:
    changed = False
    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        if (
            properties.get("source_issue_number") is not None
            and properties.get("review_status") == "pending_pr_approval"
        ):
            del properties["review_status"]
            changed = True
    return changed


def main() -> int:
    args = parse_args()
    geojson_dir = Path(args.geojson_dir)
    issues = load_json(Path(args.issues))
    if not isinstance(issues, list):
        raise SystemExit("--issues must contain a JSON array")

    collections = {
        "amenity": load_json(geojson_dir / "amenity.geojson"),
        "opening": load_json(geojson_dir / "opening.geojson"),
        "exhibit": load_json(geojson_dir / "exhibit.geojson"),
        "fixture": load_json(geojson_dir / "fixture.geojson"),
    }

    touched_layers = set()
    for layer, collection in collections.items():
        if remove_stale_pr_status(collection):
            touched_layers.add(layer)

    summaries = []
    skipped = []
    for issue in sorted(issues, key=lambda item: item.get("number", 0)):
        layer, result = build_feature(issue, args)
        if layer is None:
            skipped.append((issue, result))
            continue
        collection = collections[layer]
        issue_number = issue.get("number")
        if accepted_feature_exists(collections, issue_number):
            skipped.append((issue, "accepted feature already exists for this issue"))
            continue
        collection["features"] = [
            feature
            for feature in collection.get("features", [])
            if feature.get("properties", {}).get("source_issue_number") != issue_number
        ]
        collection["features"].append(result)
        touched_layers.add(layer)
        summaries.append((issue, layer, result))

    for layer in sorted(touched_layers):
        collection = collections[layer]
        write_json(geojson_dir / f"{layer}.geojson", collection)

    report = Path(args.report)
    report.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Issue GeoJSON Review",
        "",
        "Generated candidate GeoJSON from open GitHub issues labeled `map data`.",
        "Review each feature in this PR before merging. The pull request is the approval record.",
        "Generated points must fall within the configured UBC Vancouver bounding box.",
        "",
        "## Generated",
    ]
    if summaries:
        for issue, layer, feature in summaries:
            name = feature.get("properties", {}).get("name", {}).get("en", feature.get("id"))
            lines.append(f"- #{issue.get('number')}: `{layer}` feature `{name}` from {issue_url(issue)}")
    else:
        lines.append("- None")

    lines.extend(["", "## Issues Closed On Merge"])
    if summaries:
        for issue, _, _ in summaries:
            lines.append(f"Closes #{issue.get('number')}")
    else:
        lines.append("- None")

    lines.extend(["", "## Skipped"])
    if skipped:
        for issue, reason in skipped:
            lines.append(f"- #{issue.get('number')}: {reason} ({issue_url(issue)})")
    else:
        lines.append("- None")

    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"generated={len(summaries)} skipped={len(skipped)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
