# Beaty Biodiversity Museum Indoor Mapping

This repository stores indoor mapping data for the Beaty Biodiversity Museum. The files are GeoJSON, which is a standard text format for map features such as points, lines, and polygons.

The long-term goal is to keep the data easy to review in common map tools while moving it closer to indoor mapping conventions such as Apple's Indoor Mapping Data Format (IMDF), now also published as an OGC Community Standard.

## What's Here

The current map data is in the `geojson/` folder:

| File | What it contains | Current feature type |
| --- | --- | --- |
| `geojson/manifest.json` | IMDF package metadata | n/a |
| `geojson/address.geojson` | Museum postal address | `address` |
| `geojson/venue.geojson` | Confirmed overall venue boundary around Beaty, BRC, AERL, and the overhang | `venue` |
| `geojson/building.geojson` | Confirmed building records for Beaty, BRC, and AERL | `building` |
| `geojson/footprint.geojson` | Confirmed OSM-derived building and overhang footprints | `footprint` |
| `geojson/level.geojson` | Estimated underground museum gallery level | `level` |
| `geojson/unit.geojson` | Estimated underground cabinet gallery unit | `unit` |
| `geojson/opening.geojson` | Entrances and doors, currently empty | `opening` |
| `geojson/anchor.geojson` | Starter anchor point for the gallery unit | `anchor` |
| `geojson/amenity.geojson` | Fossil excavation exhibit points | `amenity` |
| `geojson/occupant.geojson` | Occupants, currently empty | `occupant` |
| `geojson/detail.geojson` | Walkable glass-covered fossil excavation polygons | `detail` |
| `geojson/section.geojson` | Sections, currently empty | `section` |
| `geojson/geofence.geojson` | Geofences, currently empty | `geofence` |
| `geojson/kiosk.geojson` | Kiosks, currently empty | `kiosk` |
| `geojson/relationship.geojson` | Feature relationships, currently empty | `relationship` |
| `geojson/fixture.geojson` | Display cabinet and drawer/island box polygons | `fixture` |
| `geojson/wayfinding.geojson` | Walking grid points, paths, and object connection lines | `wayfinding` |

All current features reference one level:

```text
41d0e8ca-d315-4b25-938c-7955db2daf2e
```

## Current Data Review

The existing GeoJSON is generally well formed:

- Each file is valid JSON and uses a `FeatureCollection`.
- Fixture polygons are closed.
- Coordinates are in normal longitude/latitude order.
- Fixture `display_point` values appear to be inside their polygons.
- Feature `id` values and `feature_type` values are present.

Recommended updates before treating this as a full IMDF-style indoor map:

1. Replace confirmed hull geometry with plan-verified geometry if needed.
   The venue layer now uses a locally confirmed convex hull around the Beaty, Biodiversity Research Center, AERL, and AERL/Beaty overhang footprints. This is a useful overall boundary, but a future plan-verified venue boundary may be more precise.

2. Keep fossil excavations split between amenity and detail layers.
   Fossil excavations are represented as searchable/visitor-facing exhibit points in `geojson/amenity.geojson` and as walkable glass-covered floor polygons in `geojson/detail.geojson`.

3. Keep cabinet and drawer boxes in `fixture.geojson`.
   Cabinets and drawer/island boxes are modeled as `furniture` fixtures because they are important to pedestrian navigation and the visitor experience in the underground gallery.

4. Convert `name` and `alt_name` to localized label objects if strict IMDF compatibility is required.
   IMDF examples use label objects such as `{ "en": "Ground Floor" }`, not plain strings. Plain strings are easy to edit and work well in many GeoJSON tools, but strict IMDF tooling may expect localized label objects.

5. Fix duplicate `alt_name` values in `geojson/wayfinding.geojson`.
   The walking path alternate names repeat later in the file. For example, `path_001`, `path_002`, and following values appear more than once. Alternate identifiers should be unique if they are used by scripts, search, or imports.

6. Treat `geojson/wayfinding.geojson` as a custom extension layer.
   IMDF 1.0 does not define a `wayfinding` feature type. If this data is for a custom website or app, that can be fine. If the goal is Apple Maps or strict IMDF ingestion, represent navigable space with `unit`, `opening`, `amenity`, and `anchor` features, and keep routing edges in a documented extension layer or separate application-specific file.

7. Add real openings.
   `geojson/opening.geojson` is currently empty because entrances and doors need ground-truth placement. Official indoor maps should add pedestrian entrances, internal thresholds, and accessibility information where known.

8. Add more anchors or remove unused anchor fields.
   The repo now has one starter anchor for the gallery unit, but every existing fixture still has `anchor_id: null`. That is valid for fixtures, but anchors become useful when tying addresses, occupants, amenities, or searchable exhibit records to a physical location.

9. Add a data dictionary for local terms.
   Terms such as `di_box`, `cabinet_offset_point`, `walking_grid_point`, and `fossil_center_point` are meaningful to this project but not standard IMDF categories. Keep them documented so future contributors know what they mean.

## Basic Editing Rules

Small edits are safest. Change one thing at a time, then test the file.

Please keep these rules in mind:

- Do not change coordinates unless you are intentionally moving a map feature.
- Keep longitude first and latitude second: `[longitude, latitude]`.
- Keep every feature `id` unique.
- Keep `alt_name` values unique within a file when they are used like identifiers.
- Keep `level_id` unchanged unless a feature truly belongs to a different floor.
- For polygons, the first and last coordinate pair in each ring must match.
- Use clear names that museum staff and visitors can understand.
- Avoid deleting features unless you are sure the object no longer belongs on the map.

## Testing With geojson.io

[geojson.io](https://geojson.io/) is a beginner-friendly website for checking and previewing GeoJSON.

To test a file:

1. Go to [geojson.io](https://geojson.io/).
2. Open the file from this repository in a text editor.
3. Select all of the text and copy it.
4. In geojson.io, click the `JSON` tab on the right.
5. Paste the file contents into the editor.
6. Check that the map appears near UBC in Vancouver.
7. Look for red error messages in the JSON editor.
8. If you edit the data in geojson.io, copy the full updated JSON back into the same file in this repository.

Before saving a change, confirm:

- The map still loads.
- The edited feature appears in the right place.
- There are no JSON errors.
- You did not accidentally remove the opening `{`, closing `}`, or commas between features.

## Suggested Contribution Workflow

For contributors who are new to GitHub:

1. Make a copy or branch before editing.
2. Edit only one GeoJSON file at a time.
3. Test the edited file in geojson.io.
4. Write down what changed in plain language.
5. Ask another person to review the map visually.
6. Submit the change with a short description, such as:

```text
Moved Cabinet 24 display point and corrected its name.
```

Good change descriptions answer three questions:

- What object changed?
- What changed about it?
- Why was the change needed?

## Useful References

- [OGC Indoor Mapping Data Format 1.0.0](https://docs.ogc.org/cs/20-094/index.html)
- [Apple IMDF resources](https://register.apple.com/resources/imdf/)
- [Apple MapKit indoor map documentation](https://developer.apple.com/documentation/mapkit/displaying-an-indoor-map)
- [GeoJSON format standard, RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)
