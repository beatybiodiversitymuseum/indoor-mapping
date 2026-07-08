#!/usr/bin/env python3
"""Build the local exhibit extension layer from searchable museum data."""

from __future__ import annotations

import copy
import json
import math
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
GEOJSON_DIR = ROOT / "geojson"
SOURCE_DIR = ROOT / "searchable-museum-floor-master" / "data"
PUBLIC_DOCS_DIR = SOURCE_DIR / "public-docs"
REPORT_DIR = ROOT / "reports" / "exhibit-resolution"
LEVEL_ID = "41d0e8ca-d315-4b25-938c-7955db2daf2e"
UNIT_ID = "9a5e1973-69e9-4be4-b348-38744dcff44e"
PUBLIC_URLS = {
    "drawers": "https://explore.beatymuseum.ubc.ca/docs/drawers/",
    "labels": "https://explore.beatymuseum.ubc.ca/docs/labels",
    "shadowboxes": "https://explore.beatymuseum.ubc.ca/docs/shadowboxes/",
}
KNOWN_BLANK_LABEL_SLOTS = {
    (37, 7),
    (37, 8),
    (37, 11),
    (37, 12),
    (37, 24),
    (37, 25),
    (38, 22),
    (38, 23),
    (38, 25),
    (38, 26),
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def localized(value: str) -> dict[str, str]:
    return {"en": value}


def get_alt_name(feature: dict[str, Any]) -> str | None:
    alt_name = feature.get("properties", {}).get("alt_name")
    if isinstance(alt_name, dict):
        return alt_name.get("en")
    if isinstance(alt_name, str):
        return alt_name
    return None


def polygon_centroid(geometry: dict[str, Any]) -> list[float]:
    points = geometry["coordinates"][0][:-1]
    return [
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    ]


def feature_point(feature: dict[str, Any]) -> list[float]:
    geometry = feature["geometry"]
    if geometry["type"] == "Point":
        return list(geometry["coordinates"])
    if geometry["type"] == "Polygon":
        return polygon_centroid(geometry)
    raise ValueError(f"Unsupported geometry type {geometry['type']}")


def mean_point(points: list[list[float]]) -> list[float]:
    return [
        sum(point[0] for point in points) / len(points),
        sum(point[1] for point in points) / len(points),
    ]


def meters(a: list[float] | tuple[float, float], b: list[float] | tuple[float, float]) -> float:
    latitude = ((a[1] + b[1]) / 2) * math.pi / 180
    return math.hypot(
        (b[0] - a[0]) * math.cos(latitude) * 6371000 * math.pi / 180,
        (b[1] - a[1]) * 6371000 * math.pi / 180,
    )


def parse_attrs(text: str) -> dict[str, str]:
    return dict(re.findall(r'([\w:-]+)="([^"]+)"', text))


def parse_labels_reference() -> tuple[set[tuple[int, int]], dict[int, list[int]]]:
    text = (PUBLIC_DOCS_DIR / "labels.html").read_text(encoding="utf-8")
    seen = {
        (int(face), int(cabinet))
        for face, cabinet in re.findall(r'<div class="item-caption">(\d{2})\.(\d{2})</div>', text)
    }
    ordered: dict[int, list[int]] = {}
    for match in re.finditer(
        r'<div class="folder-title">Face(\d+)</div><div class="scroll-container">(.*?)(?=<div class="folder-title">|</body>)',
        text,
        re.S,
    ):
        face = int(match.group(1))
        ordered[face] = [
            int(cabinet)
            for _face, cabinet in re.findall(r'<div class="item-caption">(\d{2})\.(\d{2})</div>', match.group(2))
        ]
    return seen, ordered


def parse_drawer_reference() -> tuple[dict[str, str], dict[int, tuple[float, float]]]:
    text = (PUBLIC_DOCS_DIR / "drawers.html").read_text(encoding="latin1")
    positions = {
        image_id.lower(): code
        for image_id, code in re.findall(r'<p class="title">(d\d+)\s*/\s*(DI\.\d+\.[^<]+)</p>', text)
    }
    rects = {}
    for match in re.finditer(r"<rect\s+([^>]+)/?>", text):
        attrs = parse_attrs(match.group(1))
        rect_id = attrs.get("id", "")
        if not re.fullmatch(r"D\d+", rect_id):
            continue
        width = float(attrs.get("width", 16.6))
        height = float(attrs.get("height", 10.9))
        rects[int(rect_id[1:])] = (float(attrs["x"]) + width / 2, float(attrs["y"]) + height / 2)
    return positions, rects


def parse_shadowbox_reference() -> tuple[set[str], set[str], dict[str, dict[str, Any]]]:
    text = (PUBLIC_DOCS_DIR / "shadowboxes.html").read_text(encoding="latin1")
    active = {item.upper() for item in re.findall(r'data-id="(s\d+)"', text)}
    archived = {item.upper() for item in re.findall(r"img/archive/(s\d+)\.jpg", text)}
    rects = {}
    for match in re.finditer(r"<rect\s+([^>]+)/?>", text):
        attrs = parse_attrs(match.group(1))
        rect_id = attrs.get("id", "")
        if not re.fullmatch(r"s\d+", rect_id):
            continue
        width = float(attrs.get("width", 8))
        height = float(attrs.get("height", 10.5))
        public_class = next(
            (
                class_name
                for class_name in attrs.get("class", "").split()
                if class_name not in {"st0", "highlight"}
            ),
            None,
        )
        rects[rect_id.upper()] = {
            "x": float(attrs["x"]),
            "y": float(attrs["y"]),
            "center": (float(attrs["x"]) + width / 2, float(attrs["y"]) + height / 2),
            "class": public_class,
        }
    return active, archived, rects


def solve_3x3(matrix: list[list[float]], vector: list[float]) -> list[float]:
    rows = [matrix[index][:] + [vector[index]] for index in range(3)]
    for column in range(3):
        pivot = max(range(column, 3), key=lambda row: abs(rows[row][column]))
        rows[column], rows[pivot] = rows[pivot], rows[column]
        divisor = rows[column][column]
        if abs(divisor) < 1e-15:
            raise ValueError("Cannot solve singular transform matrix")
        rows[column] = [value / divisor for value in rows[column]]
        for row in range(3):
            if row == column:
                continue
            factor = rows[row][column]
            rows[row] = [rows[row][i] - factor * rows[column][i] for i in range(4)]
    return [rows[row][3] for row in range(3)]


def least_squares_affine(samples: list[tuple[float, float, float]]) -> list[float]:
    normal = [[0.0 for _ in range(3)] for _ in range(3)]
    target = [0.0, 0.0, 0.0]
    for x, y, value in samples:
        row = [x, y, 1.0]
        for i in range(3):
            target[i] += row[i] * value
            for j in range(3):
                normal[i][j] += row[i] * row[j]
    return solve_3x3(normal, target)


def build_svg_transform(
    drawer_rects: dict[int, tuple[float, float]],
    fixture_by_alt: dict[str, dict[str, Any]],
) -> tuple[list[float], list[float], dict[str, float]]:
    slot_points: dict[int, list[list[float]]] = {}
    for alt_name, feature in fixture_by_alt.items():
        match = re.fullmatch(r"di_(\d+)_(\d+)_(top|L1|L2|L3)", alt_name)
        if match and match.group(3) == "top":
            slot_points.setdefault(int(match.group(2)), []).append(feature_point(feature))

    samples_lon = []
    samples_lat = []
    residuals = []
    for slot, svg_point in drawer_rects.items():
        points = slot_points.get(slot)
        if not points:
            continue
        target = mean_point(points)
        samples_lon.append((svg_point[0], svg_point[1], target[0]))
        samples_lat.append((svg_point[0], svg_point[1], target[1]))

    lon_coeff = least_squares_affine(samples_lon)
    lat_coeff = least_squares_affine(samples_lat)
    for x, y, expected_lon in samples_lon:
        expected_lat = next(item[2] for item in samples_lat if item[0] == x and item[1] == y)
        projected = [
            lon_coeff[0] * x + lon_coeff[1] * y + lon_coeff[2],
            lat_coeff[0] * x + lat_coeff[1] * y + lat_coeff[2],
        ]
        residuals.append(meters(projected, [expected_lon, expected_lat]))
    return lon_coeff, lat_coeff, {
        "sample_count": len(samples_lon),
        "max_residual_meters": max(residuals),
        "mean_residual_meters": sum(residuals) / len(residuals),
    }


def transform_point(
    svg_point: tuple[float, float],
    lon_coeff: list[float],
    lat_coeff: list[float],
) -> list[float]:
    x, y = svg_point
    return [
        lon_coeff[0] * x + lon_coeff[1] * y + lon_coeff[2],
        lat_coeff[0] * x + lat_coeff[1] * y + lat_coeff[2],
    ]


def clean_image_path(path: str | None) -> str | None:
    if not path:
        return None
    normalized = path.replace("\\", "/")
    marker = "data/exhibit-images/"
    if marker in normalized:
        return normalized.split(marker, 1)[1]
    return normalized


def normalize_records(value: Any) -> Any:
    if value in ("", [], {}, None):
        return None
    return value


def content_properties(record: dict[str, Any]) -> dict[str, Any]:
    taxonomy = {
        "family_name": normalize_records(record.get("familyName")),
        "common_group_name": normalize_records(record.get("commonGroupName")),
        "tree": normalize_records(record.get("taxonomyTree")),
    }
    taxonomy = {key: value for key, value in taxonomy.items() if value is not None}
    details = {
        "text": {"en": record.get("narrativeText")} if record.get("narrativeText") else None,
        "notes": normalize_records(record.get("notes")),
    }
    details = {key: value for key, value in details.items() if value is not None}
    content = {
        "image": {
            "id": record.get("imageId"),
            "path": clean_image_path(record.get("imagePath")),
            "type": record.get("imageType"),
        },
        "taxonomy": taxonomy or None,
        "specimens": normalize_records(record.get("species")),
        "details": details or None,
    }
    return {key: value for key, value in content.items() if value is not None}


def is_blank_or_missing_label_record(record: dict[str, Any]) -> bool:
    notes = str(record.get("notes") or "").lower()
    return "file does not exist" in notes or "file not found" in notes or "missing on disk" in notes


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def make_feature(
    exhibit_id: str,
    exhibit_type: str,
    name: str,
    record: dict[str, Any],
    archive: dict[str, Any],
    fixtures: list[dict[str, Any]],
    amenities: list[dict[str, Any]],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    points = [feature_point(item) for item in amenities or fixtures]
    properties: dict[str, Any] = {
        "category": "exhibit",
        "name": localized(name),
        "duration_type": "permanent",
        "exhibit_type": exhibit_type,
        "level_id": LEVEL_ID,
        "unit_ids": [UNIT_ID],
        "fixture_ids": [item["id"] for item in fixtures],
        "amenity_ids": [item["id"] for item in amenities],
        "fixture_alt_names": [get_alt_name(item) for item in fixtures],
        "amenity_alt_names": [get_alt_name(item) for item in amenities],
        "archive": archive,
    }
    if len(fixtures) == 1:
        properties["fixture_id"] = fixtures[0]["id"]
    if len(amenities) == 1:
        properties["amenity_id"] = amenities[0]["id"]
    properties.update(content_properties(record))
    if extra:
        properties.update(extra)
    return {
        "id": exhibit_id,
        "type": "Feature",
        "feature_type": "exhibit",
        "geometry": {"type": "Point", "coordinates": mean_point(points)},
        "properties": properties,
    }


def make_archive_feature(
    exhibit_id: str,
    exhibit_type: str,
    name: str,
    record: dict[str, Any],
    archive: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "category": "exhibit",
        "name": localized(name),
        "duration_type": "archived",
        "archive_status": "archived",
        "exhibit_type": exhibit_type,
        "level_id": LEVEL_ID,
        "unit_ids": [UNIT_ID],
        "fixture_ids": [],
        "amenity_ids": [],
        "fixture_alt_names": [],
        "amenity_alt_names": [],
        "archive": archive,
    }
    properties.update(content_properties(record))
    if extra:
        properties.update(extra)
    return {
        "id": exhibit_id,
        "type": "Feature",
        "feature_type": "exhibit",
        "geometry": None,
        "properties": properties,
    }


def report_item(source_type: str, record: dict[str, Any], reason: str, **details: Any) -> dict[str, Any]:
    return {
        "source_type": source_type,
        "source_id": record.get("imageId"),
        "location_code": record.get("location"),
        "reason": reason,
        "details": details,
        "record": record,
    }


def related_amenities(alt_names: list[str], amenity_by_alt: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    return [amenity_by_alt[f"{alt_name}_exhibits"] for alt_name in alt_names if f"{alt_name}_exhibits" in amenity_by_alt]


def main() -> int:
    fixtures = load_json(GEOJSON_DIR / "fixture.geojson")["features"]
    amenities = load_json(GEOJSON_DIR / "amenity.geojson")["features"]
    fixture_by_alt = {get_alt_name(feature): feature for feature in fixtures if get_alt_name(feature)}
    amenity_by_alt = {get_alt_name(feature): feature for feature in amenities if get_alt_name(feature)}
    labels_reference, label_public_order = parse_labels_reference()
    drawer_reference, drawer_rects = parse_drawer_reference()
    active_shadowboxes, archived_shadowboxes, shadowbox_rects = parse_shadowbox_reference()
    lon_coeff, lat_coeff, transform_stats = build_svg_transform(drawer_rects, fixture_by_alt)

    features: list[dict[str, Any]] = []
    archive_features: list[dict[str, Any]] = []
    report: list[dict[str, Any]] = []
    resolved_label_keys: set[tuple[int, int]] = set()

    for record in load_json(SOURCE_DIR / "ocr-labels.json"):
        image_id = record["imageId"]
        match = re.fullmatch(r"Face(\d+)_(\d+)", image_id)
        if not match:
            report.append(report_item("label", record, "label_id_not_parseable"))
            continue
        column = int(match.group(1))
        cabinet = int(match.group(2))
        public_seen = (column, cabinet) in labels_reference
        physical_cabinet = cabinet
        resolver_note = None
        alt_name = f"col_{column}_cab_{physical_cabinet:02d}"
        if is_blank_or_missing_label_record(record):
            report.append(report_item(
                "label",
                record,
                "source_image_or_ocr_missing",
                expected_fixture_alt_name=alt_name,
                public_reference_code=f"{column:02d}.{cabinet:02d}",
                public_reference_seen=public_seen,
                physical_cabinet=physical_cabinet,
                note="The crosswalk resolves physically, but the local source record is blank/missing and needs source image recovery plus OCR.",
            ))
            continue
        fixture = fixture_by_alt.get(alt_name)
        if not fixture:
            report.append(report_item(
                "label",
                record,
                "fixture_not_found",
                expected_fixture_alt_name=alt_name,
                public_reference_seen=public_seen,
                physical_cabinet=physical_cabinet,
            ))
            continue
        amenities_for_record = related_amenities([alt_name], amenity_by_alt)
        if not amenities_for_record:
            report.append(report_item("label", record, "amenity_not_found", fixture_alt_names=[alt_name]))
            continue
        features.append(make_feature(
            f"exhibit_label_{slug(image_id)}",
            "label",
            f"Cabinet Face {column}.{cabinet:02d}",
            record,
            {
                "collection": "labels",
                "id": image_id,
                "location_code": record.get("location"),
                "public_reference_code": f"{column:02d}.{cabinet:02d}",
                "public_reference_seen": public_seen,
                "public_reference_url": PUBLIC_URLS["labels"],
            },
            [fixture],
            amenities_for_record,
            {
                "source_cabinet_number": cabinet,
                "physical_cabinet_number": physical_cabinet,
                **({"resolver_note": resolver_note} if resolver_note else {}),
            },
        ))
        resolved_label_keys.add((column, physical_cabinet))

    for alt_name in sorted(fixture_by_alt):
        match = re.fullmatch(r"col_(\d+)_cab_(\d+)", alt_name)
        if not match:
            continue
        column = int(match.group(1))
        cabinet = int(match.group(2))
        if column == 2 or (column, cabinet) in resolved_label_keys or (column, cabinet) in KNOWN_BLANK_LABEL_SLOTS:
            continue
        report.append({
            "source_type": "label",
            "source_id": None,
            "location_code": f"Face{column:02d}",
            "reason": "source_label_missing",
            "details": {
                "expected_source_id": f"Face{column:02d}_{cabinet:02d}",
                "expected_fixture_alt_name": alt_name,
                "note": "Fixture has no corresponding label record in ocr-labels.json. Col 2 is intentionally ignored because it has no labels.",
            },
            "record": None,
        })

    drawer_stacks: dict[int, list[int]] = {}
    for alt_name in fixture_by_alt:
        match = re.fullmatch(r"di_(\d+)_(\d+)_(top|L1|L2|L3)", alt_name)
        if match:
            drawer_stacks.setdefault(int(match.group(2)), []).append(int(match.group(1)))
    drawer_stacks = {
        slot: sorted(set(columns))
        for slot, columns in drawer_stacks.items()
        if len(set(columns)) == 2
    }

    for record in load_json(SOURCE_DIR / "ocr-drawers.json"):
        image_id = record["imageId"].lower()
        public_code = drawer_reference.get(image_id)
        if not public_code:
            report.append(report_item("drawer", record, "public_reference_not_found"))
            continue
        match = re.fullmatch(r"DI\.(\d+)\.([a-zA-Z]+)(\d*)", public_code)
        if not match:
            report.append(report_item("drawer", record, "public_reference_not_parseable", public_reference_code=public_code))
            continue
        slot = int(match.group(1))
        side = match.group(2)
        level_number = match.group(3)
        columns = drawer_stacks.get(slot)
        if not columns:
            report.append(report_item("drawer", record, "drawer_slot_not_found", public_reference_code=public_code))
            continue
        fixture_alt_names: list[str]
        if side.lower().endswith("top"):
            fixture_alt_names = [f"di_{column:02d}_{slot:02d}_top" for column in columns]
        elif side.upper() in {"L", "R"} and level_number in {"1", "2", "3"}:
            column = columns[0] if side.upper() == "L" else columns[1]
            fixture_alt_names = [f"di_{column:02d}_{slot:02d}_L{level_number}"]
        else:
            report.append(report_item("drawer", record, "drawer_position_not_supported", public_reference_code=public_code))
            continue
        fixtures_for_record = [fixture_by_alt[alt_name] for alt_name in fixture_alt_names if alt_name in fixture_by_alt]
        if len(fixtures_for_record) != len(fixture_alt_names):
            report.append(report_item(
                "drawer",
                record,
                "fixture_not_found",
                public_reference_code=public_code,
                expected_fixture_alt_names=fixture_alt_names,
            ))
            continue
        amenities_for_record = related_amenities(fixture_alt_names, amenity_by_alt)
        if len(amenities_for_record) != len(fixtures_for_record):
            report.append(report_item(
                "drawer",
                record,
                "amenity_not_found",
                public_reference_code=public_code,
                fixture_alt_names=fixture_alt_names,
            ))
            continue
        features.append(make_feature(
            f"exhibit_drawer_{slug(record['imageId'])}",
            "drawer",
            f"Drawer {public_code}",
            record,
            {
                "collection": "drawers",
                "id": record["imageId"],
                "location_code": record.get("location"),
                "public_reference_code": public_code,
                "public_reference_url": PUBLIC_URLS["drawers"],
            },
            fixtures_for_record,
            amenities_for_record,
        ))

    display_cabinets = [
        feature
        for feature in fixtures
        if feature.get("properties", {}).get("local_category") == "display_cabinet"
    ]
    for record in load_json(SOURCE_DIR / "ocr-shadowboxes.json"):
        source_id = record["imageId"].upper()
        if source_id in archived_shadowboxes:
            archive_features.append(make_archive_feature(
                f"archive_shadowbox_{slug(source_id)}",
                "shadowbox",
                f"Archived Shadowbox {source_id}",
                record,
                {
                    "collection": "shadowboxes",
                    "id": source_id,
                    "location_code": record.get("location"),
                    "public_reference_code": source_id,
                    "public_reference_url": PUBLIC_URLS["shadowboxes"],
                },
                {
                    "archive_note": "Archived on the public shadowbox page and intentionally excluded from the active exhibit layer.",
                },
            ))
            continue
        if source_id not in active_shadowboxes:
            report.append(report_item(
                "shadowbox",
                record,
                "shadowbox_not_found_in_public_reference",
                public_reference_seen=False,
            ))
            continue
        shadowbox_public_record = shadowbox_rects.get(source_id)
        if not shadowbox_public_record:
            report.append(report_item("shadowbox", record, "shadowbox_svg_position_not_found"))
            continue
        projected = transform_point(shadowbox_public_record["center"], lon_coeff, lat_coeff)
        candidates = sorted(
            (
                meters(projected, feature_point(feature)),
                get_alt_name(feature),
                feature,
            )
            for feature in display_cabinets
        )
        nearest_distance, nearest_alt_name, fixture = candidates[0]
        second_distance = candidates[1][0]
        if nearest_distance > 0.35 or second_distance - nearest_distance < 0.2:
            report.append(report_item(
                "shadowbox",
                record,
                "shadowbox_fixture_ambiguous",
                public_reference_code=source_id,
                public_class=shadowbox_public_record.get("class"),
                projected_point=projected,
                candidates=[
                    {"distance_meters": round(distance, 3), "fixture_alt_name": alt_name}
                    for distance, alt_name, _feature in candidates[:5]
                ],
            ))
            continue
        fixture_alt_names = [nearest_alt_name]
        amenities_for_record = related_amenities(fixture_alt_names, amenity_by_alt)
        if not amenities_for_record:
            report.append(report_item("shadowbox", record, "amenity_not_found", fixture_alt_names=fixture_alt_names))
            continue
        features.append(make_feature(
            f"exhibit_shadowbox_{slug(source_id)}",
            "shadowbox",
            f"Shadowbox {source_id}",
            record,
            {
                "collection": "shadowboxes",
                "id": source_id,
                "location_code": record.get("location"),
                "public_reference_code": source_id,
                "public_class": shadowbox_public_record.get("class"),
                "public_reference_url": PUBLIC_URLS["shadowboxes"],
            },
            [fixture],
            amenities_for_record,
            {
                "public_class": shadowbox_public_record.get("class"),
            },
        ))

    collection = {
        "type": "FeatureCollection",
        "features": sorted(features, key=lambda feature: feature["id"]),
    }
    archive_collection = {
        "type": "FeatureCollection",
        "features": sorted(archive_features, key=lambda feature: feature["id"]),
    }
    write_json(GEOJSON_DIR / "exhibit.geojson", collection)
    write_json(GEOJSON_DIR / "archive.geojson", archive_collection)
    write_json(REPORT_DIR / "unresolved-exhibits.json", report)
    summary = {
        "accepted_count": len(features),
        "archived_count": len(archive_features),
        "unresolved_count": len(report),
        "accepted_by_type": {
            exhibit_type: sum(1 for feature in features if feature["properties"]["exhibit_type"] == exhibit_type)
            for exhibit_type in ["label", "drawer", "shadowbox"]
        },
        "archived_by_type": {
            exhibit_type: sum(1 for feature in archive_features if feature["properties"]["exhibit_type"] == exhibit_type)
            for exhibit_type in ["label", "drawer", "shadowbox"]
        },
        "unresolved_by_reason": {
            reason: sum(1 for item in report if item["reason"] == reason)
            for reason in sorted({item["reason"] for item in report})
        },
        "public_svg_transform": transform_stats,
    }
    write_json(REPORT_DIR / "summary.json", summary)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
