# Ticket photos and location corrections

## September 2026 reconciliation

- Imported 190 location submissions missing from the map.
- Converted all 194 cabinet windows into permanent records in `exhibit.geojson`, linked directly to fixtures. Cabinet-mounted content is placed on the cabinet face; navigation references identify separate route destinations. They no longer create amenity markers. This includes #118 (48.17 Lower), which had landed in Cabinet 48.18, and two submissions with misspelled cabinet names (#124 and #132).
- Centered Ramp Exit (#35), Ramp Entrance (#37), and Front Entrance (#38) on their floor-plan thresholds. Shifts are 0.516 m, 0.567 m, and 1.953 m respectively. Front Entrance uses the gap between the short interior wall end and the facing wall; its geometry is inferred from the floor plan, not a new site survey.
- Preserved submitted lines and polygons and derived line midpoints or interior representative points for their map markers. These retain the contributors’ placement; their physical positions have not been independently surveyed.
- Associated all 390 submitted photos with their ticket’s location. Apple Vision detected text in 299; 91 have no confidently detected text. Automatic text is unreviewed, especially small scientific labels. Empty records retain photo links for manual review.
- Unified place search and A/B selection. Results can set either endpoint, and searchable cabinet labels/windows reuse the approved cabinet route. Places without an approved connection remain searchable without fabricating routes.

`reports/issue-location-reconciliation.json` contains before/after coordinates, reference feature IDs, and unresolved matches (currently none). `reports/issue-image-transcriptions.json` records source URLs, OCR engine, confidence, and text. An association being resolved does not mean the OCR text is verified.

## Exhibit presentation and OCR

Window exhibits appear under “Exhibits at this spot” when selecting their cabinet. They use the normal exhibit card and layer behavior. GitHub provenance stays in the data and is not displayed in the visitor interface.

One narrative is selected per exhibit, using OCR confidence and text length to prefer a legible detail image over a noisy overview. Very short fragments are excluded when a substantive transcription exists. The overview remains the card image; repeated per-photo narratives and detail-view cards are not rendered or indexed. Raw OCR and photo references remain available internally for review. Confidence is an OCR estimate, not a human verification of scientific names.

Both the ticket importer and archive exhibit rebuild preserve converted window records, preventing duplicate amenity points on later runs.

## Reproduce

Export map tickets (increase the limit if the repository grows):

```sh
gh issue list --repo beatybiodiversitymuseum/indoor-mapping --state all --limit 1000 --json number,title,body,url,labels > /tmp/indoor-issues.json
```

On macOS, compile the local Vision helper, then extract photo text:

```sh
swiftc scripts/recognize_image_text.swift -o /tmp/indoor-vision
python3 scripts/extract_issue_image_text.py --issues /tmp/indoor-issues.json --cache /tmp/indoor-photo-cache --vision-executable /tmp/indoor-vision
```

Without `--vision-executable`, the script uses local Tesseract and Pillow. Install the Python requirements and Tesseract first. The fallback is less reliable for small labels. Both workflows download images to the cache and perform OCR locally; no photo is sent to an OCR service. Neither workflow writes to GitHub.

Review the transcript artifact, then apply the location association and regenerate the preview:

```sh
python3 scripts/reconcile_issue_locations.py --issues /tmp/indoor-issues.json --transcriptions reports/issue-image-transcriptions.json
python3 scripts/build_preview_geojson.py
python3 scripts/validate_geojson.py
npm run check
```

Reconciliation is repeatable: accepted point IDs and original coordinates are retained, and reruns replace transcription records instead of appending duplicates. Cabinet matching uses the explicit cabinet number, never OCR guesses. Unresolved references are reported. The three original entrance corrections use fixed, documented reference geometry and should be revisited if those floor-plan units change.


## Exhibit location migration

`python3 scripts/migrate_exhibit_locations.py` applies the reviewed cabinet and floor model idempotently. All content lives in `exhibit.geojson`. Each fossil excavation exhibit links to a physical glass floor-display polygon in `fixture.geojson`; those fixtures retain their material and walkability and render flat rather than as raised cabinet geometry. Cabinets remain fixtures. Service amenities and physical lab/theatre equipment are classified separately.

Former cabinet/drawer amenity points retain their IDs as `viewing_stop` navigation features. Existing access projections and walking lines are unchanged. Exhibit `navigation_point_ids` identify approved route access points; `stopping_point_ids` retain the former viewing locations. Neither becomes a visitor-facing amenity. A missing navigation association does not create a speculative path.

Cabinet labels, windows and shadowboxes use the nearest face to the former viewing point. Drawer content uses the associated fixture display positions. These are plan-derived horizontal positions, not surveyed face positions or measured elevations. Freestanding/suspended content retains submitted positions. The Exhibits layer is enabled by default.

Archive and ticket reconciliation rebuilds reapply the migration. Full archive rebuild verification currently requires the missing `searchable-museum-floor-master/data/public-docs/labels.html` input. Tests and the application build do not need that input.

## Exhibit marker visibility

Labels default to `selection-only`; windows, drawers, shadowboxes, floor exhibits and other displays default to `always`. Optional `map_display` overrides accept those two values. This only controls rendered geometry: search indexes and fixture associations use the full exhibit collection, and routing is unchanged. Selecting a search result temporarily reveals its marker, including when the Exhibits layer is off. Clearing selection hides selection-only markers again.
