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


def main() -> int:
    paths = sorted(Path("geojson").glob("*.geojson")) + [Path("geojson/manifest.json")]
    if Path("preview.geojson").exists():
        paths.append(Path("preview.geojson"))
    errors = []
    for path in paths:
        errors.extend(validate_file(path))

    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print(f"Validated {len(paths)} GeoJSON files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
