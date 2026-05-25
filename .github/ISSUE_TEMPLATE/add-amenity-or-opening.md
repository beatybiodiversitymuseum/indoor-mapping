---
name: Add or correct an Amenity or Opening
about: Submit a visitor-facing map point
title: "Amenity or Opening: "
labels: ["amenity", "map data", "needs review"]
assignees: ""
---

# Location contribution

Use this form to suggest a new location or correct an existing one.

These could include doorways, hallways, exhibits, fossil viewing points, cabinet or drawer exhibit points, kiosks, service points, restrooms, or other places visitors may search for or navigate to.


---

## 1. Location name

Use the name a visitor, staff member, or exhibit label would recognize.

Examples: `Accessible Restroom`, `Visitor Information Kiosk`, `Discovery Lab`

```text

```

---

## 2. How was the location confirmed?

Choose all that apply:

- [ ] Visually confirmed on site
- [ ] Measured on site
- [ ] Recorded with phone GPS
- [ ] Checked against a floor plan
- [ ] Derived from existing wayfinding data
- [ ] Confirmed by museum staff
- [ ] Other / unsure

Details:

```text

```

---

## 3. Reference point(s)
Provide the reference point(s) you used to produce this location. 

Use fixed reference points where possible, such as walls, doorways, columns, stairs, elevators, cabinets, or fixtures. Avoid movable objects such as chairs, signs, or bins.

```text

```

---

## 4. GPS coordinates
Add GPS coordinates for each important point along with a short description. If you don't know the GPS coordinates, measure from a known point and use GeoJSON.io to confirm.

For single-point amenities and openings, just use one point. For lines or footprints, use multiple points.

```text
Point1:
- Description:
- Latitude:
- Longitude:

Point2:
- Description:
- Latitude:
- Longitude:
```

---

## 5. Photos, screenshots, or marked-up plans

Attach helpful files, such as:
- Photo of the amenity
- Photo showing nearby walls, doors, stairs, elevators, columns, or cabinets
- Screenshot from geojson.io with the point marked
- Marked-up floor plan
- Sketch showing measurements

Notes:

```text

```

---

## 6. Notes

List anything that should be checked before adding this to the map.

Examples:
- `The point was collected with indoor phone GPS and may be approximate.`
- `The cabinet label was hard to read.`
- `I am not sure which side visitors normally approach from.`
- `The fixture ID is unknown.`

```text

```

---

# Optional: pasted GeoJSON feature

Only fill this in if you are comfortable editing GeoJSON. It is fine to leave blank.

Before pasting GeoJSON, check that:
- The feature has a unique `id`.
- Coordinates are in `[longitude, latitude]` order.
- The geometry is a `Point`.
- The existing `level_id` is unchanged unless the amenity belongs on a different floor.
- The file was tested in geojson.io.

```json

```
