# Data Dictionary

This document defines project-specific fields and values used in the Beaty Biodiversity Museum indoor mapping data.

Some fields come from IMDF-style indoor mapping concepts. Others are local extensions added so this repository can preserve museum-specific meaning, confirmed routing data, and source traceability.

## Label Fields

`name`
: Human-readable label for a feature. Labels are stored as language objects, for example `{ "en": "Underground Cabinet Gallery" }`.

`alt_name`
: Alternate label or stable short identifier. In this repository, `alt_name` is often used as a machine-friendly lookup key, also stored as a language object such as `{ "en": "col_1_cab_01" }`.

## Shared Local Fields

`local_category`
: Project-specific subtype for a feature. This is used when the IMDF `category` is too broad to describe museum-specific meaning.

`review_status`
: Review state for a feature or derived value.

Known values:

- `locally_confirmed`: Confirmed by project/local museum review.
- `derived_from_wayfinding_offset`: Created from a confirmed wayfinding offset point, but not directly hand-authored as a standalone exhibit point.

`pedestrian_importance`
: Boolean. `true` means the feature matters to pedestrian navigation, visitor orientation, or visitor experience.

`visible_to_visitors`
: Boolean. `true` means visitors can see or experience the feature.

`geometry_source`
: Describes how geometry was produced.

Known values:

- `local_confirmed_estimate`: Geometry was estimated and then locally confirmed for repository use.
- `local_confirmed_footprint_hull`: Geometry is a hull around locally confirmed footprint features.

`geometry_method`
: Plain-language explanation of how geometry was created.

`relationship_to_museum`
: Describes how a building or footprint relates to the museum.

Known values:

- `museum_public_building`: Main public museum building.
- `museum_research_center`: Biodiversity Research Centre portion associated with the museum.
- `museum_labs_and_offices`: Labs and offices associated with the museum.
- `shares_overhang_and_bike_parking`: Adjacent building shares overhang and bike parking with the museum.
- `shared_overhang_and_bike_parking`: Shared overhang/bike parking footprint.

`local_note`
: Free-text local context supplied by project maintainers.

## Source And OSM Fields

`source`
: Source name, such as `OpenStreetMap`.

`source_url`
: URL for the source feature.

`source_urls`
: Multiple source URLs when a feature is derived from more than one source feature.

`source_license`
: Source license, for example `ODbL-1.0` for OpenStreetMap.

`source_attribution`
: Required source attribution text.

`source_osm_ids`
: List of OpenStreetMap way IDs used to produce a local feature.

`osm_*`
: Raw or near-raw values preserved from OpenStreetMap. These fields are source traceability, not necessarily the final local interpretation.

Examples:

- `osm_id`
- `osm_type`
- `osm_name`
- `osm_building`
- `osm_building_levels`
- `osm_tourism`
- `osm_website`

## Buildings And Footprints

`museum`
: Local category for the Beaty Biodiversity Museum public building or venue.

`research_center`
: Local category for the Biodiversity Research Centre features associated with the museum.

`adjacent_research_laboratory`
: Local category for the Aquatic Ecosystems Research Laboratory.

`shared_overhang`
: Local category for the overhang between AERL and the Beaty Biodiversity Museum.

## Level And Unit

`ordinal: -1`
: The confirmed underground museum gallery level.

`category: "room"` in `unit.geojson`
: The underground cabinet gallery unit.

## Fixtures

`category: "furniture"`
: IMDF-style category used for cabinets and drawer/island boxes because they are physical features that matter to pedestrian movement and visitor orientation.

`display_cabinet`
: `local_category` for display cabinet polygons.

`drawer_island_box`
: `local_category` for drawer/island box polygons. This term is locally confirmed.

`source_collection`
: Records which former source collection a feature came from.

Known values:

- `cabinets`
- `drawers`

## Amenities

`category: "exhibit"`
: Visitor-facing exhibit point.

`fossil_excavation_exhibit`
: `local_category` for fossil excavation exhibit points.

`cabinet_exhibit`
: `local_category` for exhibit/viewing points associated with display cabinets. This term is locally confirmed.

`drawer_exhibit`
: `local_category` for exhibit/viewing points associated with drawer/island boxes. This term is locally confirmed.

`related_fixture_id`
: Feature ID of the physical fixture polygon associated with an exhibit point.

`source_wayfinding_id`
: ID of the original wayfinding point used to derive an exhibit/viewing point.

`source_wayfinding_type`
: Type of original wayfinding feature used as source data.

Known source values:

- `cabinet_offset_point`
- `di_offset_point`
- `walking_grid_point`
- `walking_path`
- `connection_line`

`view_radius_meters`
: Approximate viewing or interaction radius copied from the original offset point.

## Details

`category: "floor"`
: Used for walkable floor details.

`glass_floor_exhibit`
: `local_category` for glass-covered fossil excavation polygons.

`material: "glass"`
: Indicates the fossil excavation polygon is covered by glass.

`walkable`
: Boolean. `true` means visitors can walk on the feature.

`related_amenity_id`
: Feature ID of the visitor-facing amenity point associated with a detail polygon.

## Navigation Extension

`feature_type: "navigation"`
: Local extension feature type for pedestrian routing. IMDF 1.0 does not define a standard routing graph layer.

`navigation_mode: "pedestrian"`
: The routing feature is for walking.

`indoor: true`
: The routing feature is indoors.

`route_confirmed: true`
: The route has been visually confirmed.

`walking_node`
: Navigation point used as a graph node.

`walking_route`
: Navigation line between walking nodes.

`walking_connection`
: Navigation line connecting the walking graph to a fixture, exhibit, or other target.

`node_type: "grid_point"`
: Walking node originally created as a grid point.

`edge_type: "walking_path"`
: Walking route between grid nodes.

`edge_type: "fixture_or_exhibit_connection"`
: Connection between a walking node and a fixture or exhibit target.

`grid_index`
: Numeric index from the original walking grid point data.

`path_index`
: Numeric index from the original walking path data.

`connection_index`
: Numeric index from the original connection line data.

`source`
: Alias of the source endpoint for a connection line. This is not the same as the OSM/source metadata field.

`target`
: Alias of the target endpoint for a connection line.

`start_point`
: Coordinate pair for the start of a route or connection.

`end_point`
: Coordinate pair for the end of a route or connection.

`radius`
: Radius value copied from source routing/viewing data, where present.

## Anchors

`anchor_id`
: Optional reference to an anchor feature. Many current features have `anchor_id: null`.

Anchors are not required for every fixture. A fixture polygon already has geometry and a `display_point`, so adding an anchor at every fixture centroid would usually duplicate information.

Use anchors when another record needs a stable attachment point inside a unit, especially when that record should not carry its own detailed geometry. Examples might include future occupants, departments, entrances, or external collection-management records.

Navigation nodes in `geojson/navigation.geojson` are useful route graph points, but they are not the same thing as IMDF anchors:

- A navigation node is for routing through the gallery.
- An anchor is a stable attachment point for another feature or external record.

The existing navigation nodes can be used as anchor candidates if an export, app, or external system needs anchor-based lookup. In that case, create anchor features from selected navigation nodes and reference them with `anchor_id`. Do not automatically convert every navigation node or every fixture centroid into an anchor unless there is a specific consumer that needs that structure.

For this repository, cabinet and drawer exhibit points already have their own point geometry and `related_fixture_id`, so they do not need fixture-centroid anchors unless a future application specifically requires anchor-based lookup.

## Empty Standard Layers

These layers exist for IMDF-style structure but currently have no features:

- `geojson/geofence.geojson`
- `geojson/kiosk.geojson`
- `geojson/occupant.geojson`
- `geojson/opening.geojson`
- `geojson/relationship.geojson`
- `geojson/section.geojson`

## Needs Museum Confirmation

The following terms or decisions may need more precise museum language:

- Whether any real entrances, internal thresholds, or doorways should be added to `opening.geojson`.
- Whether future external systems need anchors for cabinets, exhibits, entrances, or collection-management records.
