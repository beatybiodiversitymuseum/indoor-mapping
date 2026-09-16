import argparse
import unittest

from generate_geojson_from_issues import build_feature


class IssueIngestionTest(unittest.TestCase):
    args = argparse.Namespace(
        default_level_id="level",
        default_unit_id="",
        default_amenity_category="service",
        bounds_west=-124,
        bounds_south=49,
        bounds_east=-123,
        bounds_north=50,
    )

    def issue(self, number, layer, geometry, coordinates):
        body = f"""## 1. Location name (required)
```text
Sample {layer}
```
---
## 2. Map layer (required)
- [x] {layer} — selected layer
---
## 3. How was the location confirmed?
- [x] Visually confirmed on site
---
## 4. Reference point(s)
```text
Known fixture
```
---
## 6. Notes (optional)
```text
Review note
```
---
# 7. Pasted GeoJSON feature (optional)
```json
{{"type":"Feature","geometry":{{"type":"{geometry}","coordinates":{coordinates}}},"properties":{{}}}}
```"""
        return {"number": number, "title": f"Location: Sample {layer}", "body": body, "labels": [{"name": "map data"}]}

    def test_generates_each_supported_layer(self):
        cases = [
            ("Exhibit", "Point", "[-123.25,49.26]", "exhibit"),
            ("Amenity", "Point", "[-123.25,49.26]", "amenity"),
            ("Opening", "LineString", "[[-123.25,49.26],[-123.2501,49.2601]]", "opening"),
            ("Fixture", "Polygon", "[[[-123.25,49.26],[-123.2501,49.26],[-123.2501,49.2601],[-123.25,49.26]]]", "fixture"),
        ]
        for number, (label, geometry, coordinates, expected) in enumerate(cases, 1):
            layer, feature = build_feature(self.issue(number, label, geometry, coordinates), self.args)
            self.assertEqual(layer, expected)
            self.assertEqual(feature["feature_type"], expected)
            self.assertEqual(feature["properties"]["confirmation_methods"], ["Visually confirmed on site"])

    def test_rejects_line_geometry_for_an_amenity(self):
        layer, message = build_feature(self.issue(5, "Amenity", "LineString", "[[-123.25,49.26],[-123.2501,49.2601]]"), self.args)
        self.assertIsNone(layer)
        self.assertIn("invalid geometry for amenity", message)


if __name__ == "__main__":
    unittest.main()
