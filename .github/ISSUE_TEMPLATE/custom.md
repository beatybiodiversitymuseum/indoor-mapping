---
name: Add or correct an Amenity or Opening
about: Submit a visitor-facing map point
title: "Amenity or Opening: "
labels: ["amenity", "map data", "needs review"]
assignees: ""
---

# Amenity contribution

Use this template to suggest a new amenity or correct an existing one.

Amenities are visitor-facing points of interest, such as exhibits, fossil excavation viewing points, cabinet exhibit points, drawer exhibit points, kiosks, service points, or other things a visitor may search for or navigate to.

You do **not** need to edit GeoJSON to submit this issue. Please fill in the plain-text fields below. A maintainer can turn the information into a correct `geojson/amenity.geojson` entry.

---

## 1. What are you submitting?

Choose one:

- [ ] New amenity
- [ ] New opening
- [ ] Correction to an existing amenity
- [ ] Correction to an existing opening
- [ ] I am not sure

---

## 2. Visitor-facing amenity name

Use the name that a visitor, museum staff member, or exhibit label would recognize.

Examples:

- `Accessible Restroom`
- `Visitor Information Kiosk`
- `Discovery Lab`

**Amenity name:**

```text

```

---

## 3. Amenity or Opening type

Write what kind of point this is.

Examples:
- `doorway`
- `kiosk`
- `service point`
- `visitor information point`

**Amenity or Opening type:**

```text

```

---

## 4. Visitor standing or viewing point

Describe the exact point visitors should navigate to.

The point should usually be where a visitor would stand, look, or arrive — not necessarily the center of the object.

Examples:

- `In front of the cabinet, centered on the cabinet face.`
- `At the normal viewing side of the drawer island.`
- `On the glass viewing edge where visitors naturally stop.`
- `At the approach side of the kiosk.`

**Visitor point description:**

```text

```

---

## 5. How was the location confirmed?

Choose all that apply:

- [ ] Visually confirmed on site
- [ ] Measured on site
- [ ] Recorded with phone GPS
- [ ] Checked against a floor plan
- [ ] Derived from existing wayfinding data
- [ ] Confirmed by museum staff
- [ ] Other / unsure

**Details:**

```text

```

---

## 6. Measurement or placement notes

If possible, describe how the point was measured or located.

Good examples:

- `Point is 1.2 m in front of Cabinet 01, centered on the cabinet face.`
- `Point is 0.8 m east of the southwest corner of Drawer Island 03.`
- `Point is directly in front of the fossil excavation glass, aligned with the center of the viewing edge.`
- `Phone GPS recorded while standing at the viewing point. Indoor GPS may be approximate.`

If measuring, use a fixed confirmed spot where possible, such as a wall corner, doorway, column, stair, elevator entrance, or mapped cabinet/fixture. Avoid measuring from movable objects such as chairs, temporary signs, or garbage bins.

**Measurement or placement notes:**

```text

```

---

## 7. GPS coordinates

Indoor GPS can be inaccurate, but it may still be useful as supporting information.

If you use your phone, stand as close as possible to the visitor viewing point and paste the coordinates below.

If you're estimating using GeoJson.io, then submit the coordinates given there.

Remember: GeoJSON uses longitude first, then latitude.

**Phone GPS coordinates:**

```text
Latitude:
Longitude:
```

---

## 8. Photos, screenshots, or marked-up floor plans

Attach any helpful files to this issue.

Helpful attachments include:

- Photo of the amenity
- Photo showing nearby walls, doors, stairs, elevators, columns, or cabinets
- Screenshot from geojson.io with the point marked
- Marked-up floor plan
- Sketch showing measurements from a confirmed spot

**Attachments or notes:**

```text

```

---

## 9. Is the amenity visible to visitors?

Choose one:

- [ ] Visible to visitors
- [ ] Not visible to visitors
- [ ] Staff-only
- [ ] Temporarily hidden
- [ ] Behind glass
- [ ] Inside a cabinet or drawer
- [ ] Unknown

**Visibility notes:**

```text

```

---

## 10. Is it useful for navigation?

Choose one:

- [ ] Yes, visitors may search for it
- [ ] Yes, it is a major exhibit point
- [ ] No, it is only supporting information
- [ ] Unknown

**Navigation notes:**

```text

```

---

## 11. Related fixture, cabinet, drawer, or island

If this amenity belongs to a mapped object, write the related fixture name or ID if known.

Examples:

- `Cabinet 01`
- `Drawer Island 03`
- `Related fixture unknown`

Do not invent a fixture ID.

**Related fixture:**

```text

```

---

## 12. Anything uncertain?

List anything that should be reviewed before this is added to the map.

Examples:

- `The point was collected with indoor phone GPS and may be approximate.`
- `The cabinet label was hard to read.`
- `I am not sure which side visitors normally approach from.`
- `The fixture ID is unknown.`

**Uncertainty or reviewer notes:**

```text

```

---

# Optional: pasted GeoJSON feature

Only fill this in if you are comfortable editing GeoJSON.

It is completely fine to leave this section blank.

Before pasting GeoJSON, check that:

- The feature has a unique `id`.
- Coordinates are in `[longitude, latitude]` order.
- The geometry is a `Point`.
- The existing `level_id` is unchanged unless the amenity belongs on a different floor.
- The file was tested in geojson.io.

```json

```
