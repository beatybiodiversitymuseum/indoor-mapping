#!/usr/bin/env python3
"""Validate repository GeoJSON files with lightweight structural checks."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def validate_file(path: Path) -> list[str]:
    errors = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON: {exc}"]

    if path.name == "manifest.json":
        return errors

    if data.get("type") != "FeatureCollection":
        errors.append(f"{path}: root type must be FeatureCollection")
        return errors

    ids = set()
    features = data.get("features")
    if not isinstance(features, list):
        errors.append(f"{path}: features must be a list")
        return errors

    for index, feature in enumerate(features):
        prefix = f"{path}: feature {index}"
        if feature.get("type") != "Feature":
            errors.append(f"{prefix}: type must be Feature")
        feature_id = feature.get("id")
        if not feature_id:
            errors.append(f"{prefix}: missing id")
        elif feature_id in ids:
            errors.append(f"{prefix}: duplicate id {feature_id}")
        ids.add(feature_id)

        geometry = feature.get("geometry")
        if geometry is None:
            continue
        if not isinstance(geometry, dict):
            errors.append(f"{prefix}: geometry must be an object")
            continue
        if not geometry.get("type"):
            errors.append(f"{prefix}: geometry.type is required")
        if "coordinates" not in geometry:
            errors.append(f"{prefix}: geometry.coordinates is required")
        if not isinstance(feature.get("properties"), dict):
            errors.append(f"{prefix}: properties must be an object")

    return errors


def validate_level_references(paths: list[Path]) -> list[str]:
    """Ensure level references resolve to a feature in the canonical level layer."""
    level_path = Path("geojson/level.geojson")
    try:
        level_data = json.loads(level_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # validate_file reports the more useful missing/invalid-file error.
        return []

    level_ids = {
        feature.get("id")
        for feature in level_data.get("features", [])
        if feature.get("id")
    }
    errors = []
    for path in paths:
        if path.name == "manifest.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        for index, feature in enumerate(data.get("features", [])):
            properties = feature.get("properties")
            if not isinstance(properties, dict):
                continue
            references = []
            if properties.get("level_id"):
                references.append(properties["level_id"])
            level_ids_value = properties.get("level_ids", [])
            if isinstance(level_ids_value, list):
                references.extend(level_ids_value)
            for level_id in references:
                if level_id not in level_ids:
                    errors.append(
                        f"{path}: feature {index}: level reference {level_id} "
                        "does not exist in geojson/level.geojson"
                    )
    return errors


def load_collection(name: str) -> dict:
    return json.loads((Path("geojson") / f"{name}.geojson").read_text(encoding="utf-8"))


def validate_map_model() -> list[str]:
    """Check the visitor-facing extension model and its cross-layer references."""
    layer_names = ["amenity", "opening", "exhibit", "fixture", "navigation"]
    try:
        collections = {name: load_collection(name) for name in layer_names}
    except (OSError, json.JSONDecodeError):
        return []

    errors = []
    ids = {name: {feature.get("id") for feature in collection.get("features", [])} for name, collection in collections.items()}
    alt_names = {
        name: {
            feature.get("properties", {}).get("alt_name", {}).get("en")
            for feature in collection.get("features", [])
            if isinstance(feature.get("properties", {}).get("alt_name"), dict)
        }
        for name, collection in collections.items()
    }
    issue_layers = {}

    for layer, collection in collections.items():
        for index, feature in enumerate(collection.get("features", [])):
            properties = feature.get("properties", {})
            prefix = f"geojson/{layer}.geojson: feature {index}"
            if feature.get("feature_type") != layer:
                errors.append(f"{prefix}: feature_type must be {layer}")
            issue_number = properties.get("source_issue_number")
            if issue_number is not None:
                previous = issue_layers.setdefault(issue_number, layer)
                if previous != layer:
                    errors.append(f"{prefix}: source issue {issue_number} also exists in {previous}.geojson")

            if layer == "amenity" and properties.get("category") == "exhibit":
                errors.append(f"{prefix}: exhibits belong in exhibit.geojson")
            if layer == "exhibit":
                if not properties.get("exhibit_type"):
                    errors.append(f"{prefix}: exhibit_type is required")
                for fixture_id in properties.get("fixture_ids", []):
                    if fixture_id not in ids["fixture"]:
                        errors.append(f"{prefix}: fixture reference {fixture_id} does not exist")
                for navigation_id in [*properties.get("navigation_point_ids", []), *properties.get("stopping_point_ids", [])]:
                    if navigation_id not in ids["navigation"]:
                        errors.append(f"{prefix}: navigation reference {navigation_id} does not exist")
                route_id = properties.get("route_fixture_id")
                fixture_names = properties.get("fixture_alt_names", [])
                if route_id and route_id not in alt_names["fixture"] and route_id not in alt_names["exhibit"]:
                    errors.append(f"{prefix}: route fixture {route_id} does not resolve")
                for fixture_name in fixture_names:
                    if fixture_name not in alt_names["fixture"]:
                        errors.append(f"{prefix}: fixture alt name {fixture_name} does not resolve")

    return errors


def main() -> int:
    paths = sorted(Path("geojson").glob("*.geojson")) + [Path("geojson/manifest.json")]
    if Path("preview.geojson").exists():
        paths.append(Path("preview.geojson"))
    errors = []
    for path in paths:
        errors.extend(validate_file(path))
    errors.extend(validate_level_references(paths))
    errors.extend(validate_map_model())

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {len(paths)} GeoJSON files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
