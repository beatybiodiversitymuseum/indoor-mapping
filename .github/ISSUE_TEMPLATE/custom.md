---
name: New amenity map point
description: Suggest a new visitor-facing amenity point for the indoor museum map
title: "Add amenity: [short visitor-facing name]"
labels: ["amenity", "mapping", "needs review"]
body:
  - type: markdown
    attributes:
      value: |
        Use this form to suggest a new visitor-facing amenity point for the indoor museum map.

        Amenities are things a visitor may search for, walk to, stand near, view, or use. Examples include exhibit viewing points, fossil excavation viewing areas, cabinet exhibit points, drawer exhibit points, kiosks, service points, or visitor information points.

        You do **not** need to edit GeoJSON to submit this issue. The most useful contribution is clear, accurate field information. A maintainer can turn your notes into a valid entry in `geojson/amenity.geojson`.

        Please do not guess. If something is uncertain, write `unknown` or explain the uncertainty.

  - type: input
    id: amenity-name
    attributes:
      label: Visitor-facing amenity name
      description: Use the name a visitor, museum staff member, or exhibit label would recognize.
      placeholder: "Example: Column 1, Cabinet 01"
    validations:
      required: true

  - type: dropdown
    id: amenity-type
    attributes:
      label: Amenity type
      description: Choose the closest plain-language type. If none fits, choose Other and explain below.
      options:
        - fossil excavation viewing point
        - cabinet exhibit point
        - drawer exhibit point
        - kiosk
        - service point
        - visitor information point
        - other / unsure
    validations:
      required: true

  - type: textarea
    id: amenity-type-notes
    attributes:
      label: Amenity type notes
      description: If you chose Other, Unsure, or need to explain the category, describe it here.
      placeholder: "Example: This is a small touch-screen station beside the main exhibit path."
    validations:
      required: false

  - type: textarea
    id: visitor-point
    attributes:
      label: Exact visitor standing, viewing, or arrival point
      description: Describe where the map point should go. The point should usually be where a visitor would stand, look, or arrive, not the centre of the object.
      placeholder: |
        Example: Stand in front of the cabinet, centered on the cabinet face.

        Example: Point is on the glass viewing edge where visitors naturally stop.

        Example: Point is at the visitor-facing side of the drawer island, not in the middle of the island.
    validations:
      required: true

  - type: dropdown
    id: location-confirmation-method
    attributes:
      label: How was the location confirmed?
      description: Choose the main method used to confirm this point.
      options:
        - visually confirmed on site
        - measured on site with tape measure or laser measure
        - recorded with phone GPS
        - checked against a floor plan
        - derived from existing wayfinding data
        - confirmed by museum staff
        - not yet confirmed
        - other / unsure
    validations:
      required: true

  - type: textarea
    id: measurement-details
    attributes:
      label: Measurement or placement details
      description: Give enough detail for someone else to place or review the point. Measurements from confirmed fixed spots are especially helpful.
      placeholder: |
        Good examples:

        - Point is 1.0 m directly in front of Cabinet 01, centered on the cabinet face.
        - Point is 0.8 m east of the southwest corner of Drawer Island 03.
        - Point is directly in front of the fossil excavation glass, aligned with the center of the viewing edge.
        - Phone GPS was recorded while standing at the viewing point. Indoor GPS may be approximate.

        If measuring, use a fixed reference point such as a wall corner, doorway, column, stair, elevator entrance, or fixture already on the map. Avoid movable objects such as chairs, bins, or temporary signs.
    validations:
      required: true

  - type: textarea
    id: coordinates
    attributes:
      label: Coordinates, if known
      description: Optional. If you used phone GPS or another tool, paste the coordinates here. GeoJSON uses longitude first, then latitude.
      placeholder: |
        Example:
        longitude: -123.251234
        latitude: 49.263456

        Or GeoJSON coordinate order:
        [-123.251234, 49.263456]
    validations:
      required: false

  - type: textarea
    id: photos-or-sketches
    attributes:
      label: Photos, screenshots, sketches, or floor-plan marks
      description: Attach or describe any photo, screenshot, marked-up map, or sketch that helps locate the amenity.
      placeholder: |
        Example: Attached a photo showing the cabinet, nearby column, and wall corner.

        Example: Attached a screenshot from geojson.io with a marker drawn at the visitor standing point.
    validations:
      required: false

  - type: dropdown
    id: visibility
    attributes:
      label: Is this amenity visible or available to visitors?
      options:
        - visible to visitors
        - not visible to visitors
        - staff-only
        - temporarily hidden
        - behind glass
        - inside cabinet
        - unknown
    validations:
      required: true

  - type: dropdown
    id: navigation-importance
    attributes:
      label: Is this amenity useful as a navigation destination?
      description: Choose whether visitors may reasonably search for or navigate to this point.
      options:
        - yes, visitors may search for it
        - yes, it is a major exhibit point
        - maybe / unsure
        - no, it is only supporting information
    validations:
      required: true

  - type: textarea
    id: related-fixture
    attributes:
      label: Related fixture, cabinet, drawer, island, or object
      description: If this amenity belongs to a mapped object, name it here. Do not invent an ID.
      placeholder: |
        Example: Related to Cabinet 01
        Example: Related to Drawer Island 03
        Example: Related fixture unknown
    validations:
      required: false

  - type: textarea
    id: reviewer-notes
    attributes:
      label: Notes for reviewer
      description: Include anything uncertain, temporary, or important for a maintainer to know.
      placeholder: |
        Example: The point should be the viewing position, not the center of the cabinet.

        Example: Indoor phone GPS may be approximate. Photo shows nearby wall and cabinet for placement.
    validations:
      required: false

  - type: textarea
    id: optional-geojson
    attributes:
      label: Optional pasted GeoJSON feature
      description: Only fill this in if you are comfortable editing GeoJSON. Otherwise leave it blank.
      render: json
      placeholder: |
        {
          "type": "Feature",
          "id": "replace-with-unique-id",
          "feature_type": "amenity",
          "properties": {
            "name": { "en": "Example Amenity Name" },
            "category": "example category",
            "level_id": "41d0e8ca-d315-4b25-938c-7955db2daf2e"
          },
          "geometry": {
            "type": "Point",
            "coordinates": [-123.251234, 49.263456]
          }
        }
    validations:
      required: false
