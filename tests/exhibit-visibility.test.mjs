import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exhibitMarkerVisible } from '../app/exhibit-visibility.js';
import { relatedExhibitsForFeature } from '../app/exhibits.js';
const read = name => JSON.parse(readFileSync(new URL(`../geojson/${name}.geojson`, import.meta.url)));
const exhibits = read('exhibit');
test('labels and cabinet displays are selection-only while mapped exhibit types remain visible', () => {
  for (const feature of exhibits.features) {
    const selectionOnly = feature.properties.exhibit_type === 'label' || feature.properties.map_display === 'selection-only';
    assert.equal(exhibitMarkerVisible(feature), !selectionOnly);
    assert.equal(exhibitMarkerVisible(feature, feature.id), true);
  }
});
test('hiding label markers retains cabinet associations and record content', () => {
  const fixture = read('fixture').features.find(f => f.properties.alt_name?.en === 'col_46_cab_12');
  const related = relatedExhibitsForFeature(fixture, exhibits);
  assert.ok(related.some(f => f.properties.exhibit_type === 'label'));
  assert.ok(related.some(f => f.properties.exhibit_type === 'cabinet_display'));
  assert.equal(related.filter(f => exhibitMarkerVisible(f)).length, 0);
});
test('individual exhibits can opt into selection-only without losing their selected marker', () => {
  const feature = { id: 'artwork', feature_type: 'exhibit', properties: { exhibit_type: 'display', map_display: 'selection-only' } };
  assert.equal(exhibitMarkerVisible(feature), false);
  assert.equal(exhibitMarkerVisible(feature, 'artwork'), true);
  assert.equal(exhibitMarkerVisible({ ...feature, properties: { exhibit_type: 'label', map_display: 'always' } }), true);
});
