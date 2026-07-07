#!/usr/bin/env python3
"""Build the basement gallery Unit from the Level minus its Ramp Units."""

import json
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union


ROOT = Path(__file__).resolve().parents[1]
LEVEL_FILE = ROOT / "geojson" / "level.geojson"
UNIT_FILE = ROOT / "geojson" / "unit.geojson"

BASEMENT_LEVEL_ID = "41d0e8ca-d315-4b25-938c-7955db2daf2e"
GALLERY_UNIT_ID = "9a5e1973-69e9-4be4-b348-38744dcff44e"


def read_collection(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    levels = read_collection(LEVEL_FILE)
    units = read_collection(UNIT_FILE)

    basement = next(feature for feature in levels["features"] if feature["id"] == BASEMENT_LEVEL_ID)
    ramps = [
        feature
        for feature in units["features"]
        if feature["properties"].get("level_id") == BASEMENT_LEVEL_ID
        and feature["properties"].get("category") == "ramp"
    ]
    if not ramps:
        raise SystemExit("No Basement Ramp Units found; refusing to build gallery geometry.")

    gallery_geometry = shape(basement["geometry"]).difference(
        unary_union([shape(feature["geometry"]) for feature in ramps])
    )
    if gallery_geometry.is_empty or not gallery_geometry.is_valid:
        raise SystemExit("Derived gallery geometry is empty or invalid.")

    gallery = {
        "id": GALLERY_UNIT_ID,
        "type": "Feature",
        "feature_type": "unit",
        "geometry": mapping(gallery_geometry),
        "properties": {
            "category": "room",
            "restriction": None,
            "accessibility": None,
            "name": {"en": "Museum Floor"},
            "alt_name": None,
            "level_id": BASEMENT_LEVEL_ID,
            "display_point": mapping(gallery_geometry.representative_point()),
            "geometry_source": "derived_from_level_and_units",
            "geometry_method": "Basement Level geometry minus Basement Ramp Unit geometries.",
            "review_status": "locally_confirmed",
        },
    }

    units["features"] = [feature for feature in units["features"] if feature["id"] != GALLERY_UNIT_ID]
    first_basement = next(
        (index for index, feature in enumerate(units["features"]) if feature["properties"].get("level_id") == BASEMENT_LEVEL_ID),
        len(units["features"]),
    )
    units["features"].insert(first_basement, gallery)
    UNIT_FILE.write_text(json.dumps(units, indent=2) + "\n", encoding="utf-8")
    print(f"Built gallery Unit {GALLERY_UNIT_ID} from Basement Level minus {len(ramps)} Ramp Units.")


if __name__ == "__main__":
    main()
