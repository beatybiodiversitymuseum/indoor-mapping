import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relatedExhibitsForFeature } from '../app/exhibits.js';
import { buildRoutingNetwork, findApprovedRoute } from '../app/routing.js';
const read = name => JSON.parse(readFileSync(new URL(`../geojson/${name}.geojson`, import.meta.url)));
const exhibits = read('exhibit'), fixtures = read('fixture'), navigation = read('navigation');
test('exhibit migration separates services, fixture content and stopping points', () => {
  assert.equal(read('detail').features.length, 0);
  assert.equal(read('amenity').features.some(f=>f.properties.category==='exhibit'),false);
  assert.equal(navigation.features.filter(f=>f.properties.wayfinding_type==='viewing_stop').length,1444);
  const collection = {features:[...exhibits.features,...fixtures.features]};
  const cabinet = fixtures.features.find(f=>f.properties.alt_name?.en==='col_46_cab_12');
  assert.equal(relatedExhibitsForFeature(cabinet,collection).length,2);
  const network = buildRoutingNetwork(navigation);
  const ids = new Set(navigation.features.map(f=>f.id));
  for(const exhibit of exhibits.features){
    assert.equal(exhibit.properties.amenity_ids,undefined);
    for(const id of exhibit.properties.navigation_point_ids) assert.ok(ids.has(id));
    for(const id of exhibit.properties.stopping_point_ids) assert.ok(ids.has(id));
  }
  const floors = exhibits.features.filter(f=>f.properties.exhibit_type==='floor');
  const floorFixtures = fixtures.features.filter(f=>f.properties.local_category==='floor_display_fixture');
  assert.equal(floors.length,9);
  assert.equal(floorFixtures.length,9);
  for(const floor of floors){
    assert.equal(floor.geometry.type,'Point');
    assert.equal(floor.properties.walkable,true);
    assert.equal(floor.properties.material,'glass');
    assert.equal(floor.properties.fixture_ids.length,1);
    const fixture = floorFixtures.find(f=>f.id===floor.properties.fixture_ids[0]);
    assert.ok(fixture);
    assert.equal(fixture.geometry.type,'Polygon');
    assert.equal(fixture.properties.walkable,true);
    assert.equal(fixture.properties.material,'glass');
    assert.deepEqual(fixture.properties.exhibit_ids,[floor.id]);
    assert.equal(floor.properties.route_fixture_id, floor.properties.alt_name.en);
    assert.ok(findApprovedRoute(network,cabinet,floor));
    assert.equal(relatedExhibitsForFeature(floor,collection).length,1);
    assert.equal(relatedExhibitsForFeature(fixture,collection).length,1);
  }
});
