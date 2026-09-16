#!/usr/bin/env python3
"""Separate exhibit locations, fixtures, services and navigation stopping points.

Idempotent. Cabinet-face positions are derived from existing plans, not surveys.
No new walking paths or route connections are created.
"""
import json
import math
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def migrate():
    def read(name):
        return json.loads((ROOT / 'geojson' / f'{name}.geojson').read_text())
    data = {name: read(name) for name in ['amenity', 'detail', 'exhibit', 'fixture', 'navigation']}
    fixtures = {f['id']: f for f in data['fixture']['features']}
    navigation = data['navigation']['features']
    stops = {f['id']: f for f in navigation if f['properties'].get('wayfinding_type') == 'viewing_stop'}
    retained = []
    for feature in data['amenity']['features']:
        p = feature['properties']
        if p.get('local_category') in {'cabinet_exhibit', 'drawer_exhibit'}:
            feature['feature_type'] = 'navigation'
            p.update(category='stopping_point', wayfinding_type='viewing_stop')
            stops[feature['id']] = feature
        else:
            retained.append(feature)
    navigation[:] = [f for f in navigation if f['id'] not in stops] + list(stops.values())
    data['amenity']['features'] = retained
    stops_by_fixture = {}
    for f in stops.values():
        key = f['properties'].get('related_fixture_id')
        if key:
            stops_by_fixture[key] = f
    access = {}
    for f in navigation:
        if f['properties'].get('wayfinding_type') == 'access_projection':
            for key in f['properties'].get('sources', [f['properties'].get('source')]):
                access.setdefault(key, []).append(f['id'])

    surfaces = {f['properties'].get('related_amenity_id'): f for f in data['detail']['features'] if f['properties'].get('local_category') == 'glass_floor_exhibit'}
    moved_surfaces = set()
    remaining = []
    services = {'Fire Extinguisher': 'fireextinguisher', 'Garbage and Recycling Bins': 'waste', 'Discovery Lab Sink': 'sink', 'Discovery Lab Microscope': 'equipment', 'Theatre Priority Seating': 'seating', 'Theatre Regular Seating': 'seating'}
    fixture_names = {'Theatre Projection Booth', 'Theatre Screen'} | {f'Discovery Lab Table {i}' for i in range(1,9)}
    for f in data['amenity']['features']:
        p = f['properties']; name = p.get('name', {}).get('en', '')
        surface = surfaces.get(f['id'])
        if name in services:
            p['category'] = services[name]
            remaining.append(f)
            continue
        if name in fixture_names:
            f['feature_type'] = 'fixture'
            p.update(category='furniture', local_category='equipment')
            data['fixture']['features'].append(f)
            continue
        if surface or p.get('local_category') == 'issue_submitted_amenity':
            f['feature_type'] = 'exhibit'
            p.update(category='exhibit', duration_type='permanent', exhibit_type='floor' if surface else 'display')
            p.setdefault('details', {'text': {'en': p.get('photo_text', '')}})
            p.setdefault('specimens', [])
            if surface:
                f['geometry'] = surface['geometry']
                for field in ['material', 'walkable', 'level_id', 'display_point']:
                    p[field] = surface['properties'][field]
                moved_surfaces.add(surface['id'])
            p.pop('local_category', None)
            data['exhibit']['features'].append(f)
        else:
            remaining.append(f)
    data['amenity']['features'] = remaining
    data['detail']['features'] = [f for f in data['detail']['features'] if f['id'] not in moved_surfaces]

    def face_point(fixture, point):
        ring = fixture['geometry']['coordinates'][0]
        scale = math.cos(math.radians(point[1])); best = None
        for a,b in zip(ring,ring[1:]):
            dx,dy = (b[0]-a[0])*scale,b[1]-a[1]
            if not dx*dx+dy*dy: continue
            t = max(0,min(1,((point[0]-a[0])*scale*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)))
            q = [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]
            distance = math.hypot((q[0]-point[0])*scale,q[1]-point[1])
            if best is None or distance < best[0]: best = (distance,q)
        return best[1]

    def bearing(origin, destination):
        latitude = math.radians((origin[1] + destination[1]) / 2)
        return round(math.degrees(math.atan2(
            (destination[0] - origin[0]) * math.cos(latitude),
            destination[1] - origin[1],
        )) % 360, 2)

    for f in data['exhibit']['features']:
        p = f['properties']
        if p.get('exhibit_type') == 'floor':
            fixture_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"museum-floor-fixture:{f['id']}"))
            floor_fixture = next((item for item in data['fixture']['features'] if item['id'] == fixture_id), None)
            if not floor_fixture:
                floor_fixture = {
                    'id': fixture_id, 'type': 'Feature', 'feature_type': 'fixture',
                    'geometry': f['geometry'],
                    'properties': {
                        'category': 'furniture', 'name': p['name'],
                        'alt_name': {'en': f"{p['alt_name']['en']}_fixture"},
                        'level_id': p['level_id'], 'unit_ids': p.get('unit_ids', []),
                        'display_point': p['display_point'],
                        'local_category': 'floor_display_fixture',
                        'material': p.get('material', 'glass'),
                        'walkable': p.get('walkable', True),
                        'exhibit_ids': [f['id']],
                        'review_status': p.get('review_status', 'locally_confirmed'),
                    },
                }
                data['fixture']['features'].append(floor_fixture)
            fixtures[fixture_id] = floor_fixture
            p['fixture_ids'] = [fixture_id]
            p['fixture_alt_names'] = [floor_fixture['properties']['alt_name']['en']]
            p['route_fixture_id'] = p['alt_name']['en']
            f['geometry'] = {'type': 'Point', 'coordinates': p['display_point']['coordinates']}
        focused = [fixtures[i] for i in p.get('fixture_ids', []) if i in fixtures]
        # Position cabinet-mounted content on the visitor-facing cabinet boundary.
        if p.get('exhibit_type') in {'label','window','shadowbox'} and len(focused) == 1:
            fixture = focused[0]; stop = stops_by_fixture.get(fixture['id'])
            if stop and fixture['geometry']['type'] == 'Polygon':
                f['geometry'] = {'type':'Point','coordinates':face_point(fixture,stop['geometry']['coordinates'])}
                p.pop('display_point',None)
                p['location_review_status'] = 'derived_cabinet_face'
                p['marker_bearing'] = bearing(f['geometry']['coordinates'], stop['geometry']['coordinates'])
        if p.get('exhibit_type') == 'drawer' and focused:
            pairs = [(x, stops_by_fixture.get(x['id'])) for x in focused]
            pairs = [(x, stop) for x, stop in pairs if stop]
            points = [face_point(x, stop['geometry']['coordinates']) for x, stop in pairs]
            viewing_points = [stop['geometry']['coordinates'] for _, stop in pairs]
            if points:
                location = [sum(q[i] for q in points)/len(points) for i in range(2)]
                viewing = [sum(q[i] for q in viewing_points)/len(viewing_points) for i in range(2)]
                f['geometry'] = {'type':'Point','coordinates':location}
                p['marker_bearing'] = bearing(location, viewing)
            p.pop('display_point', None)
            p['location_review_status'] = 'derived_drawer_face'
        keys = p.get('fixture_alt_names', []) or [p.get('route_fixture_id') or p.get('alt_name',{}).get('en')]
        p['navigation_point_ids'] = list(dict.fromkeys(i for key in keys for i in access.get(key, [])))
        p['stopping_point_ids'] = [stops_by_fixture[x['id']]['id'] for x in focused if x['id'] in stops_by_fixture]
        p.pop('marker_label', None)
        for field in ['amenity_id','amenity_ids','amenity_alt_names']:
            p.pop(field,None)
    for name,collection in data.items():
        (ROOT/'geojson'/f'{name}.geojson').write_text(json.dumps(collection,ensure_ascii=False,indent=2)+'\n')
    print({name: len(c['features']) for name,c in data.items()})

if __name__ == '__main__':
    migrate()
