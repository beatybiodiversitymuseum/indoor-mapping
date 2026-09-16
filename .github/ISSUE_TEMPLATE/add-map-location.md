---
name: Add or correct a map location
about: Submit an exhibit, fixture, amenity, or opening
title: "Location: "
labels: ["map data", "needs review"]
assignees: ""
---

# Location contribution

Use this form to add a location or correct an existing one. The map records exhibits, their supporting fixtures, visitor amenities, and openings as separate kinds of feature.

---

## 1. Location name (required)

Use the name a visitor, staff member, or exhibit label would recognize.

Examples: `Cabinet 46.12 Window`, `Discovery Lab Table 1`, `Accessible Restroom`, `Theatre West Doors`

```text


```

---

## 2. Map layer (required)

Choose exactly one:

- [ ] Exhibit — visitor-facing content, including cabinet windows, labels, shadowboxes, drawer exhibits, floor displays, and standalone displays
- [ ] Fixture — a cabinet, drawer unit, table, case, floor-display footprint, or other physical support
- [ ] Amenity — a restroom, waste bin, service, or visitor facility
- [ ] Opening — a door, entrance, exit, ramp threshold, or passage

---

## 3. How was the location confirmed?

Choose one or more:

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

## 4. Physical location and reference points

Describe where the feature physically exists using fixed references such as walls, doors, columns, cabinets, or fixtures.

For an exhibit, include its supporting or focused fixture when one exists. Record the exhibit’s actual position, such as the cabinet face or floor location. If visitors should stop somewhere different to view it, describe that viewing position separately.

For an opening, describe both ends of the threshold when possible.

```text
Physical location:

Related fixture, if any:

Preferred viewing or arrival point, if different:

Measurements or other references:

```

---

## 5. Photos, screenshots, or marked-up plans (optional)

Attach any useful evidence:

- An overview showing the feature and fixed surroundings
- Detail photos of labels or text
- A marked-up floor plan or geojson.io screenshot
- A measurement sketch

Photos with the same name and ticket are treated as detail views of one feature unless you say otherwise. Clear detail photos may supply text in place of lower-quality overview OCR.

---

## 6. Notes (optional)

List uncertainty, access restrictions, temporary conditions, or anything that needs review.

```text


```

---

# 7. Pasted GeoJSON feature (optional)

Only fill this in if you are comfortable editing GeoJSON.

- Coordinates use `[longitude, latitude]` order.
- Exhibits and amenities use `Point`.
- Openings may use `Point` or `LineString`.
- Fixtures may use `Point`, `LineString`, or `Polygon`.
- Use the feature’s physical position. Routing and viewing points are associated separately during review.
- Keep the existing `level_id` unless the feature is on a different floor.

```json


```
