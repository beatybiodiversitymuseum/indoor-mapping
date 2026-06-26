---
name: Add or correct an Amenity or Opening
about: Submit a visitor-facing map point
title: "Amenity: "
labels: ["amenity", "map data", "needs review"]
assignees: ""
---

# Location contribution

Use this form to suggest a new location or correct an existing one.

These could include doorways, hallways, exhibits, fossil viewing points, cabinet or drawer exhibit points, kiosks, service points, restrooms, or other places visitors may search for or navigate to.


---

## 1. Location name (required)

Use the name a visitor, staff member, or exhibit label would recognize.

Examples: `Accessible Restroom`, `Visitor Information Kiosk`, `Discovery Lab`

Include `opening`, `door`, `entrance`, or `exit` in the issue title or labels when the location should be generated into `geojson/opening.geojson`. Other point submissions are generated into `geojson/amenity.geojson`.

```text






```

---

## 2. How was the location confirmed?

Choose one or more that apply:

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

## 4. Photos, screenshots, or marked-up plans (optional)

Attach helpful files, such as:
- Photo of the amenity
- Photo showing nearby walls, doors, stairs, elevators, columns, or cabinets
- Screenshot from geojson.io with the point marked
- Marked-up floor plan
- Sketch showing measurements


---

## 5. Notes (optional)

List anything that should be checked before adding this to the map.

Examples:
- `The point was collected with indoor phone GPS and may be approximate.`
- `The cabinet label was hard to read.`
- `I am not sure which side visitors normally approach from.`
- `The fixture ID is unknown.`

```text





```

---

# 6. Pasted GeoJSON feature (optional)

Only fill this in if you are comfortable editing GeoJSON. It is fine to leave blank.

Before pasting GeoJSON, check that:
- The feature has a unique `id`.
- Coordinates are in `[longitude, latitude]` order.
- The geometry is a `Point`.
- The existing `level_id` is unchanged unless the amenity belongs on a different floor.
- The file was tested in geojson.io.

```json





```
