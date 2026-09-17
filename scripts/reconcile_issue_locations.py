#!/usr/bin/env python3
"""Attach ticket photo text and reconcile points against explicit map references.

Inputs are a read-only `gh issue list --state all --json number,title,body,url,labels`
export and the JSON output of extract_issue_image_text.py. No GitHub writes.
"""
import argparse
import json
import re
from pathlib import Path
from types import SimpleNamespace

from structure_window_exhibits import normalize

from pyproj import Transformer
from shapely.geometry import Point, LineString, shape
from shapely.ops import transform, nearest_points

from generate_geojson_from_issues import build_feature, optional_geojson_feature, UBC_BOUNDS, BASEMENT_LEVEL_ID

GROUND_LEVEL_ID = '553481bd-bdec-4fe2-8e59-6110190e9b94'


def read(path):
    return json.loads(Path(path).read_text())


def write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--issues', required=True)
    parser.add_argument('--transcriptions', required=True)
    args = parser.parse_args()
    layers = {name: read(f'geojson/{name}.geojson') for name in ['amenity', 'opening', 'fixture', 'unit', 'exhibit', 'navigation']}
    features = {f['properties'].get('source_issue_number'): f for name in ['amenity', 'opening', 'exhibit', 'fixture'] for f in layers[name]['features'] if f['properties'].get('source_issue_number')}
    fixtures = {f['properties']['alt_name']['en']: f for f in layers['fixture']['features'] if f['properties'].get('alt_name')}
    viewing = {f['properties']['related_fixture_id']: f for f in layers['amenity']['features'] + layers['navigation']['features'] if f['properties'].get('local_category') == 'cabinet_exhibit'}
    options = SimpleNamespace(default_level_id=BASEMENT_LEVEL_ID, default_unit_id='', default_amenity_category='exhibit', **{f'bounds_{k}': v for k, v in UBC_BOUNDS.items()})
    forward = Transformer.from_crs(4326, 32610, always_xy=True).transform
    inverse = Transformer.from_crs(32610, 4326, always_xy=True).transform
    corrections, unresolved = [], []

    def relocate(feature, coordinates, method, refs):
        props = feature['properties']
        old = props.get('location_correction', {}).get('original_coordinates', feature['geometry']['coordinates'])
        feature['geometry']['coordinates'] = list(coordinates)
        if 'display_point' in props:
            props['display_point'] = {'type': 'Point', 'coordinates': list(coordinates)}
        distance = transform(forward, Point(old)).distance(transform(forward, Point(coordinates)))
        props['location_correction'] = {'original_coordinates': old, 'method': method, 'reference_feature_ids': refs, 'distance_meters': round(distance, 3)}
        corrections.append({'issue': props['source_issue_number'], 'name': props['name']['en'], **props['location_correction'], 'coordinates': list(coordinates)})

    for issue in sorted(read(args.issues), key=lambda i: i['number']):
        if not re.match(r'Amenity(?: or Opening)?:', issue['title'], re.I):
            continue
        feature = features.get(issue['number'])
        if not feature:
            submitted = optional_geojson_feature(issue.get('body') or '')
            submitted_geometry = submitted.get('geometry') if submitted else None
            import_issue = issue
            if submitted_geometry and submitted_geometry.get('type') in {'LineString', 'Polygon'}:
                geometry = transform(forward, shape(submitted_geometry))
                if geometry.is_empty or not geometry.is_valid:
                    unresolved.append({'issue': issue['number'], 'reason': 'Invalid submitted geometry'})
                    continue
                center = geometry.interpolate(.5, normalized=True) if geometry.geom_type == 'LineString' else geometry.representative_point()
                point = transform(inverse, center)
                submitted['geometry'] = {'type': 'Point', 'coordinates': list(point.coords)[0]}
                import_issue = {**issue, 'body': re.sub(r'```json[\s\S]*?```', '```json\n' + json.dumps(submitted) + '\n```', issue['body'], count=1)}
            layer, feature = build_feature(import_issue, options)
            if layer is None:
                unresolved.append({'issue': issue['number'], 'reason': feature})
                continue
            feature['properties']['imported_by'] = 'issue_location_reconciliation'
            feature['properties']['location_review_status'] = 'submitted_coordinates'
            if submitted_geometry and submitted_geometry['type'] != 'Point':
                feature['properties']['submitted_geometry'] = submitted_geometry
                feature['properties']['location_review_status'] = 'derived_from_submitted_geometry'
                feature['properties']['placement_method'] = 'Midpoint of submitted line' if submitted_geometry['type'] == 'LineString' else 'Interior representative point of submitted polygon'
            layers[layer]['features'].append(feature)
            features[issue['number']] = feature
        props = feature['properties']
        match = re.fullmatch(r'(?:Cabinet|Cabiner|Cabient)\s+(\d+)\.(\d+)(?:\s+Window)?(?:\s+(?:Upper|Lower))?', props['name']['en'], re.I)
        if match:
            props['name']['en'] = re.sub(r'^Cabin(?:er|et)|^Cabient', 'Cabinet', props['name']['en'])
            if ' Window' not in props['name']['en']:
                props['name']['en'] = re.sub(r'(\s+(?:Upper|Lower))$', r' Window\1', props['name']['en'], flags=re.I)
            key = f'col_{int(match[1])}_cab_{int(match[2]):02d}'
            fixture = fixtures.get(key)
            target = viewing.get(fixture['id']) if fixture else None
            if not target:
                unresolved.append({'issue': issue['number'], 'reason': f'No confirmed viewing position for {key}'})
                continue
            coordinate = target['geometry']['coordinates']
            if shape(fixture['geometry']).contains(Point(coordinate)):
                unresolved.append({'issue': issue['number'], 'reason': f'Existing viewing position is inside {key}'})
                continue
            props.update(related_fixture_id=fixture['id'], route_fixture_id=key, location_review_status='derived_from_wayfinding_offset')
            relocate(feature, coordinate, 'Use the existing visitor viewing point for the cabinet explicitly named in the submission.', [fixture['id'], target['id']])
            # A window is permanent content of this cabinet, not another amenity.
            if feature in layers['amenity']['features']:
                layers['amenity']['features'].remove(feature)
            if feature not in layers['exhibit']['features']:
                layers['exhibit']['features'].append(feature)
            feature['feature_type'] = 'exhibit'
            props.pop('local_category', None)
            suffix = ' Upper' if props['name']['en'].endswith('Upper') else ' Lower' if props['name']['en'].endswith('Lower') else ''
            props['archive'] = {'public_reference_code': f'{int(match[1]):02d}.{int(match[2]):02d}{suffix}'}
            props.update(category='exhibit', duration_type='permanent', exhibit_type='window',
                         fixture_ids=[fixture['id']], fixture_alt_names=[key],
                         amenity_ids=[target['id']], amenity_alt_names=[target['properties']['alt_name']['en']],
                         unit_ids=target['properties'].get('unit_ids', []), specimens=[])


    units = {f['properties'].get('ramp_role'): f for f in layers['unit']['features'] if f['properties'].get('ramp_role')}
    # The issue plans identify these two short, open ends of the ramp.
    for number, role, edge in [(35, 'lower_descending_right', (1, 2)), (37, 'middle_landing', (1, 2))]:
        unit = units[role]
        ring = unit['geometry']['coordinates'][0]
        center = transform(inverse, transform(forward, LineString([ring[edge[0]], ring[edge[1]]])).interpolate(.5, normalized=True))
        relocate(features[number], list(center.coords)[0], 'Center of the ramp threshold identified in the issue measurement plan.', [unit['id']])

    # Front entrance: center the gap from the short interior wall end to the
    # facing wall, using the same floor-plan outlines as the submitted sketch.
    by_id = {f['id']: f for f in layers['unit']['features']}
    jamb_wall = by_id['d5cfca4b-6d36-4fcb-a205-345a8d1672e0']
    facing_wall = by_id['0fd942c4-04b5-4cf5-ad27-e957d0f69f5f']
    ring = jamb_wall['geometry']['coordinates'][0]
    cap = transform(forward, LineString([ring[2], ring[3]])).interpolate(.5, normalized=True)
    opposite = nearest_points(cap, transform(forward, shape(facing_wall['geometry'])))[1]
    center = transform(inverse, LineString([cap, opposite]).interpolate(.5, normalized=True))
    relocate(features[38], list(center.coords)[0], 'Center of the interior doorway gap between the short wall end and facing wall in the floor plan.', [jamb_wall['id'], facing_wall['id']])
    features[38]['properties']['level_id'] = GROUND_LEVEL_ID

    # Plural door names are openings too. Move only this importer’s new records.
    for feature in list(layers['amenity']['features']):
        props = feature['properties']
        if props.get('imported_by') == 'issue_location_reconciliation' and re.search(r'\b(openings?|doors?|entrances?|exits?)\b', props['name']['en'], re.I):
            layers['amenity']['features'].remove(feature)
            layers['opening']['features'].append(feature)
            feature['feature_type'] = 'opening'
            props.update(category='pedestrian', local_category='issue_submitted_opening')

    records = read(args.transcriptions)
    for feature in features.values():
        matched = [r for r in records if r['issue_number'] == feature['properties']['source_issue_number']]
        if matched:
            props = feature['properties']
            props['image_transcriptions'] = matched
            # Detail views replace noisy overview OCR. Keep all raw evidence internally.
            candidates = [r for r in matched if len(r.get('text', '').split()) >= 8]
            candidates = candidates or [r for r in matched if r.get('text', '').strip()]
            best = max(candidates, key=lambda r: (r.get('confidence', 0), len(r['text'])), default=None)
            props['photo_text'] = best['text'] if best else ''
            props['photo_text_source_url'] = best['image_url'] if best else None
            if feature['feature_type'] == 'exhibit':
                props['image'] = {'url': matched[0]['image_url'], 'type': 'window'}
                normalize(props)

    for record in records:
        if record['issue_number'] not in features:
            unresolved.append({'issue': record['issue_number'], 'reason': 'Photo has no mapped location', 'image_url': record['image_url']})
    # Issue 134 documents the mounted reef display in cabinet 46.12. Its
    # original issue title called it a window, but it is not a window feature.
    cabinet_display = features.get(134)
    if cabinet_display:
        props = cabinet_display['properties']
        props['name']['en'] = 'Cabinet 46.12 Display'
        props['exhibit_type'] = 'cabinet_display'
        props['map_display'] = 'selection-only'
        if props.get('image'):
            props['image']['type'] = 'cabinet_display'
    # The Irish elk skull sits on top of cabinet 01.03. Keep its surveyed point
    # while associating it with the cabinet for browsing and routing.
    irish_elk = features.get(286)
    irish_elk_fixture = fixtures.get('col_1_cab_03')
    if irish_elk and irish_elk_fixture:
        props = irish_elk['properties']
        props.update(
            related_fixture_id=irish_elk_fixture['id'],
            fixture_id=irish_elk_fixture['id'],
            fixture_ids=[irish_elk_fixture['id']],
            fixture_alt_names=['col_1_cab_03'],
            fixture_placement='top',
            display_count=2,
            route_fixture_id='col_1_cab_03',
        )
        props.pop('route_association', None)
        props['photo_text'] = ''
        props['details'] = {'text': {'en': ''}}
    for name in ['amenity', 'opening', 'exhibit']:
        write(f'geojson/{name}.geojson', layers[name])
    report = {'imported_issue_locations': sorted(f['properties']['source_issue_number'] for f in features.values() if f['properties'].get('imported_by') == 'issue_location_reconciliation'), 'corrections': corrections, 'unresolved': unresolved, 'image_count': len(records), 'images_with_text': sum(bool(r.get('text')) for r in records), 'images_without_text': sum(not r.get('text') for r in records)}
    write('reports/issue-location-reconciliation.json', report)
    from migrate_exhibit_locations import migrate
    migrate()
    print(json.dumps({k: len(v) if isinstance(v, list) else v for k, v in report.items()}))


if __name__ == '__main__':
    main()
