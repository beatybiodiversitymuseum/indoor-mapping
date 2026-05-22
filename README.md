# Beaty Biodiversity Museum Indoor Mapping

This repository stores indoor mapping data for the Beaty Biodiversity Museum. The files are GeoJSON, which is a standard text format for map features such as points, lines, and polygons.

The long-term goal is to keep the data easy to review in common map tools while moving it closer to indoor mapping conventions such as Apple's Indoor Mapping Data Format (IMDF), now also published as an OGC Community Standard.

Supporting documentation:

- `DATA_SOURCES.md` explains source data, local review decisions, and derivation methods.
- `DATA_DICTIONARY.md` defines local fields, local category values, and terms that need museum confirmation.

## What's Here

The current map data is in the `geojson/` folder:

| File | What it contains | Current feature type |
| --- | --- | --- |
| `geojson/manifest.json` | IMDF package metadata | n/a |
| `geojson/address.geojson` | Museum postal address | `address` |
| `geojson/venue.geojson` | Confirmed overall venue boundary around Beaty, BRC, AERL, and the overhang | `venue` |
| `geojson/building.geojson` | Confirmed building records for Beaty, BRC, and AERL | `building` |
| `geojson/footprint.geojson` | Confirmed OSM-derived building and overhang footprints | `footprint` |
| `geojson/level.geojson` | Confirmed underground museum gallery level | `level` |
| `geojson/unit.geojson` | Confirmed underground cabinet gallery unit | `unit` |
| `geojson/opening.geojson` | Entrances and doors, currently empty | `opening` |
| `geojson/anchor.geojson` | Starter anchor point for the gallery unit | `anchor` |
| `geojson/amenity.geojson` | Fossil excavation, cabinet, and drawer exhibit points | `amenity` |
| `geojson/occupant.geojson` | Occupants, currently empty | `occupant` |
| `geojson/detail.geojson` | Walkable glass-covered fossil excavation polygons | `detail` |
| `geojson/section.geojson` | Sections, currently empty | `section` |
| `geojson/geofence.geojson` | Geofences, currently empty | `geofence` |
| `geojson/kiosk.geojson` | Kiosks, currently empty | `kiosk` |
| `geojson/navigation.geojson` | Confirmed pedestrian route graph extension | `navigation` |
| `geojson/relationship.geojson` | Feature relationships, currently empty | `relationship` |
| `geojson/fixture.geojson` | Display cabinet and drawer/island box polygons | `fixture` |

Mapped indoor gallery features reference one confirmed underground level:

```text
41d0e8ca-d315-4b25-938c-7955db2daf2e
```

## Current Data Status

The existing GeoJSON is generally well formed:

- Each file is valid JSON and uses a `FeatureCollection`.
- Fixture polygons are closed.
- Coordinates are in normal longitude/latitude order.
- Fixture `display_point` values appear to be inside their polygons.
- Feature `id` values and `feature_type` values are present.

Confirmed modeling decisions:

- `geojson/venue.geojson` uses a locally confirmed convex hull around the Beaty, Biodiversity Research Centre, AERL, and AERL/Beaty overhang footprints.
- Fossil excavations are represented as searchable exhibit points in `geojson/amenity.geojson` and as walkable glass-covered floor polygons in `geojson/detail.geojson`.
- Cabinets and drawer/island boxes are modeled as `furniture` fixtures in `geojson/fixture.geojson` because they are important to pedestrian navigation and the visitor experience.
- Cabinet and drawer exhibit viewing points have been derived from the original wayfinding offset points and stored in `geojson/amenity.geojson`.
- Confirmed walking routes are stored in `geojson/navigation.geojson` as a local extension layer for routing and app use. IMDF 1.0 does not define a standard pedestrian routing graph layer.

Remaining improvements:

1. Add real openings.
   `geojson/opening.geojson` is currently empty because entrances and doors need ground-truth placement. Official indoor maps should add pedestrian entrances, internal thresholds, and accessibility information where known.

2. Decide whether future integrations need anchors.
   Many features have their own geometry and do not need anchors. Navigation nodes can be used as anchor candidates later if an app, export, or collection-management integration needs stable attachment points.

3. Review open data dictionary questions.
   `DATA_DICTIONARY.md` defines local terms and lists a few museum-language questions that still need confirmation.


## Basic Editing Rules

Small edits are safest. Change one thing at a time, then test the file.

Please keep these rules in mind:

- Do not change coordinates unless you are intentionally moving a map feature.
- Keep longitude first and latitude second: `[longitude, latitude]`.
- Keep every feature `id` unique.
- Keep `alt_name` values unique within a file when they are used like identifiers. In these files, labels use language objects such as `{ "en": "Column 1, Cabinet 01" }`.
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
