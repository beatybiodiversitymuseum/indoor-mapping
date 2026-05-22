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


## Adding Amenities and Openings

Two common contributions are openings and amenities. You do not need to know how to program, but please be precise and test the file in geojson.io before submitting changes.

### Amenities

Amenities are visitor-facing points of interest, such as exhibits, fossil excavation viewing points, cabinet exhibit points, drawer exhibit points, kiosks, service points, or other things a visitor may search for or navigate to. They belong in `geojson/amenity.geojson`.

You do not need to know how to code to help add an amenity. The most important thing is to collect clear, accurate information so that the JSON entry can be created or reviewed correctly.

If you are submitting a new amenity, please use the GitHub issue template for amenity contributions. The issue template asks for the information a maintainer needs without requiring you to edit GeoJSON.

Each amenity should answer these questions:

#### 1. What is the visitor-facing name?

Use the name that a visitor, museum staff member, or exhibit label would recognize.

Good examples:

```text
Gift Shop Cash Register
Visitor Information Kiosk
```

Avoid vague names such as:

```text
Thing near wall
Display
Cabinet
```

If there is a label on the object, copy the label exactly. If there is no label, describe it clearly and consistently.

#### 2. What kind of amenity is it?

Write down what the point represents.

Examples:

```text
kiosk
service point
visitor information point
accessibility points
restroom
```

If you are not sure which category to use, write your best plain-language description. A maintainer can choose the final category.

#### 3. Where should a visitor navigate to?

The amenity point should usually mark where a visitor should stand, look, or arrive — not necessarily the exact middle of the object.


#### 4. How did you confirm the location?

Every new amenity should include how the location was confirmed. This helps reviewers know whether the point is reliable.

Use one of these methods where possible:

```text
visually confirmed on site
measured on site
recorded with phone GPS
derived from existing wayfinding data
checked against a floor plan
confirmed by museum staff
```

Phone GPS can be useful, but indoor GPS is often inaccurate. If you use a phone, record the location while standing as close as possible to the amenity and include a note that it was collected indoors with a phone.


#### 5. How can someone measure the location without editing JSON?

If you cannot confidently place the point in GeoJSON, collect enough information for someone else to place it.

Useful options:

- Use your phone to record GPS coordinates while standing at the visitor viewing point.
- Take a photo showing the amenity and nearby fixed objects, such as walls, doors, stairs, elevators, columns, or cabinets.
- Measure with a tape measure from a confirmed spot already on the map.
- Mark the point on a printed floor plan or screenshot.
- Write a short description of the location using nearby landmarks.

Good measurement examples:

```text
Standing point is 1.2 m in front of Cabinet 01, centered on the cabinet face.
```

```text
Point is 0.8 m east of the southwest corner of Drawer Island 03.
```

```text
Point is directly in front of the fossil excavation glass, aligned with the center of the viewing edge.
```

```text
Phone GPS recorded while standing at the viewing point. Indoor GPS may be approximate.
```

If measuring from a confirmed spot, use a spot that is unlikely to move, such as:

- a wall corner
- a doorway
- a column
- a stair or elevator entrance
- a cabinet or fixture already mapped in `geojson/fixture.geojson`

Avoid measuring from movable objects such as chairs, temporary signs, or garbage bins.

#### 6. Is the amenity visible to visitors?

Record whether a normal visitor can see or access the amenity.

Examples:

```text
visible to visitors
not visible to visitors
staff-only
temporarily hidden
behind glass
inside cabinet
```

#### 7. Is it important for navigation?

Record whether visitors may reasonably search for this amenity or use it as a destination.

Examples:

```text
yes, visitors may search for it
yes, it is a major exhibit point
no, it is only supporting information
unknown
```

#### 8. Is it related to a fixture?

If the amenity belongs to a cabinet, drawer box, island, or other mapped object, write down the related fixture name or ID if you know it.

Examples:

```text
related to Cabinet 01
related to Drawer Island 03
related fixture unknown
```

Do not invent a fixture ID. If you do not know it, leave a note.

---

#### Beginner-friendly checklist for a new amenity

Before submitting a new amenity, make sure you have recorded:

- Name of the amenity
- Type of amenity
- Exact visitor standing/viewing point
- How the location was confirmed
- Whether it is visible to visitors
- Whether it is useful for navigation
- Related cabinet, drawer, island, or fixture, if known
- Any uncertainty or notes for the reviewer

A maintainer can turn these notes into a correct entry in `geojson/amenity.geojson`.

---

#### If you are proposing the JSON directly

Copy an existing amenity entry that is similar to the one you want to add, paste it as a new feature, and then change only the values that describe the new amenity.

Be careful to:

- Give the new feature a unique `id`.
- Keep coordinates in this order: `[longitude, latitude]`.
- Use a point marker for the amenity location.
- Keep the existing `level_id` unless the amenity is on a different floor.
- Keep commas between features.
- Test the full file in geojson.io before submitting.

If you are not sure what a field means, do not guess. Add a plain-language note instead, or ask a maintainer to review it.

### Openings

Openings are places where a person can pass through a boundary, such as exterior entrances, doors, and internal thresholds between spaces. Follow the same process as Amenities, but record them as openings.

### Submission Instructions
Submit your Amenity or Opening edit as a GitHub Issue by clicking "Issues" and using the provided "Amenity and Opening Template".

## Useful References

- [OGC Indoor Mapping Data Format 1.0.0](https://docs.ogc.org/cs/20-094/index.html)
- [Apple IMDF resources](https://register.apple.com/resources/imdf/)
- [Apple MapKit indoor map documentation](https://developer.apple.com/documentation/mapkit/displaying-an-indoor-map)
- [GeoJSON format standard, RFC 7946](https://www.rfc-editor.org/rfc/rfc7946)
