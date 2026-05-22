# Data Sources

This repository includes both museum-maintained indoor mapping data and public reference data.

## Confirmed OpenStreetMap Building Footprints

`geojson/building.geojson` and `geojson/footprint.geojson` contain locally confirmed building and footprint records derived from OpenStreetMap data around the Beaty Biodiversity Museum area.

Source:

- OpenStreetMap API map extract around the museum area
- Primary named feature found: [OpenStreetMap way 36835375](https://www.openstreetmap.org/way/36835375), `name=Beaty Biodiversity Museum`
- Downloaded on 2026-05-22

License and attribution:

- OpenStreetMap data is copyright OpenStreetMap contributors.
- OpenStreetMap data is available under the Open Database License (ODbL).
- See [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright).

Local review notes:

- [OpenStreetMap way 83435229](https://www.openstreetmap.org/way/83435229) has been locally identified as part of the Biodiversity Research Center.
- [OpenStreetMap way 89366251](https://www.openstreetmap.org/way/89366251) has been locally identified as the overhang between Aquatic Ecosystems Research Laboratory and the Beaty Biodiversity Museum.
- [OpenStreetMap way 33176122](https://www.openstreetmap.org/way/33176122), `name=Aquatic Ecosystems Research Laboratory`, shares an overhang and bike parking with the Beaty and should be kept in the reference source set.
- [OpenStreetMap way 1395853158](https://www.openstreetmap.org/way/1395853158), currently tagged `building=construction` in OSM, has been locally identified as part of the Biodiversity Research Center and contains the museum labs and offices.

Metadata conventions:

- `osm_*` fields preserve the values downloaded from OpenStreetMap.
- `name`, `local_category`, `relationship_to_museum`, and `local_note` record the locally reviewed interpretation.
- `review_status: "locally_confirmed"` means the local interpretation has been reviewed by project maintainers.
- `source`, `source_url`, `source_license`, and `source_attribution` preserve the OSM source trail for each promoted feature.

## Confirmed Underground Cabinet Gallery

`geojson/level.geojson` and `geojson/unit.geojson` contain a locally confirmed underground rectangle for the cabinet gallery section.

Method:

- Start from the southeast corner of the locally confirmed overhang feature, [OpenStreetMap way 89366251](https://www.openstreetmap.org/way/89366251).
- Project east to the first intersection with the locally confirmed Biodiversity Research Center footprint, [OpenStreetMap way 83435229](https://www.openstreetmap.org/way/83435229).
- Use the north/south extent of the current cabinet, drawer/island box, and fossil excavation fixture polygons, with a small buffer, so the mapped fixture geometry fits inside the rectangle.

Current confirmed rectangle:

```text
west:  -123.2510135
east:  -123.2501680727888
south:  49.26330852224385
north:  49.26365041140521
```

This geometry is marked with `geometry_source: "local_confirmed_estimate"` and `review_status: "locally_confirmed"`. Replace it with plan-verified geometry if more precise building plans become available.

## Confirmed Venue Boundary

`geojson/venue.geojson` contains the overall venue boundary for the connected Beaty/AERL/Biodiversity Research Center area.

Method:

- Use the locally confirmed footprint polygons in `geojson/footprint.geojson`.
- Compute a single convex hull around the Beaty Biodiversity Museum, Biodiversity Research Center, Aquatic Ecosystems Research Laboratory, and AERL/Beaty overhang footprints.
- Store that hull as the venue geometry with `geometry_source: "local_confirmed_footprint_hull"` and `review_status: "locally_confirmed"`.

This gives the venue one continuous boundary while keeping the more detailed building footprints in `geojson/footprint.geojson`.

## Confirmed Furniture Fixtures

`geojson/fixture.geojson` contains the locally confirmed cabinet and drawer/island box polygons.

These features are modeled as `category: "furniture"` because they are important to pedestrian navigation and the visitor experience in the underground gallery. Each feature also includes:

- `local_category`, with values such as `display_cabinet` and `drawer_island_box`.
- `pedestrian_importance: true`.
- `review_status: "locally_confirmed"`.
- `source_collection`, recording whether the feature came from the former cabinet or drawer source file.

## Confirmed Fossil Excavation Exhibits

Fossil excavations are represented in two layers:

- `geojson/amenity.geojson` stores visitor-facing exhibit points with `category: "exhibit"`.
- `geojson/detail.geojson` stores the walkable glass-covered fossil excavation polygons with `category: "floor"` and `local_category: "glass_floor_exhibit"`.

The detail polygons are marked with:

- `material: "glass"`.
- `walkable: true`.
- `pedestrian_importance: true`.
- `visible_to_visitors: true`.
- `related_amenity_id`, linking each polygon to its exhibit point.
- `review_status: "locally_confirmed"`.
