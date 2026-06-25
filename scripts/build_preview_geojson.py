#!/usr/bin/env python3
"""Build a stacked GeoJSON preview file for geojson.io review."""

from __future__ import annotations

import copy
import json
from pathlib import Path


PREVIEW_LAYERS = [
    "amenity",
    "fixture",
    "detail",
    "kiosk",
    "footprint",
    "level",
    "unit",
]


def main() -> int:
    features = []
    for layer in PREVIEW_LAYERS:
        path = Path("geojson") / f"{layer}.geojson"
        with path.open(encoding="utf-8") as handle:
            collection = json.load(handle)

        for feature in collection.get("features", []):
            preview_feature = copy.deepcopy(feature)
            preview_feature.setdefault("properties", {})
            preview_feature["properties"]["preview_layer"] = layer
            features.append(preview_feature)

    preview = {
        "type": "FeatureCollection",
        "name": "Beaty Biodiversity Museum Preview",
        "features": features,
    }
    preview_path = Path("preview.geojson")
    tmp_path = preview_path.with_suffix(".geojson.tmp")
    with tmp_path.open("w", encoding="utf-8") as handle:
        json.dump(preview, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    tmp_path.replace(preview_path)

    print(f"Wrote preview.geojson with {len(features)} features from {len(PREVIEW_LAYERS)} layers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
