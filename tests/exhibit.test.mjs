import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const exhibit = JSON.parse(await readFile(new URL("../geojson/exhibit.geojson", import.meta.url), "utf8"));
const archive = JSON.parse(await readFile(new URL("../geojson/archive.geojson", import.meta.url), "utf8"));
const fixture = JSON.parse(await readFile(new URL("../geojson/fixture.geojson", import.meta.url), "utf8"));
const amenity = JSON.parse(await readFile(new URL("../geojson/amenity.geojson", import.meta.url), "utf8"));
const report = JSON.parse(await readFile(new URL("../reports/exhibit-resolution/unresolved-exhibits.json", import.meta.url), "utf8"));

const fixturesById = new Map(fixture.features.map((feature) => [feature.id, feature]));
const amenitiesById = new Map(amenity.features.map((feature) => [feature.id, feature]));
const exhibitsById = new Map(exhibit.features.map((feature) => [feature.id, feature]));

test("accepted exhibits all resolve to existing map features", () => {
  assert.equal(exhibit.type, "FeatureCollection");
  assert.equal(exhibit.features.length, 1490);
  for (const feature of exhibit.features) {
    assert.equal(feature.feature_type, "exhibit");
    assert.equal(feature.properties.duration_type, "permanent");
    assert.ok(feature.properties.fixture_ids.length || feature.properties.amenity_ids.length);
    for (const fixtureId of feature.properties.fixture_ids) assert.ok(fixturesById.has(fixtureId), fixtureId);
    for (const amenityId of feature.properties.amenity_ids) assert.ok(amenitiesById.has(amenityId), amenityId);
    assert.equal("legibility" in feature.properties, false);
    assert.equal("audit_flags" in feature.properties, false);
    assert.equal("public_map_distance_meters" in feature.properties, false);
    assert.equal("public_svg_x" in feature.properties.archive, false);
    assert.equal("public_svg_y" in feature.properties.archive, false);
  }
});

test("drawer archive ordering resolves left/right drawers without collapsing stacks", () => {
  const top = exhibitsById.get("exhibit_drawer_d001");
  assert.deepEqual(top.properties.fixture_alt_names, ["di_05_01_top", "di_06_01_top"]);
  assert.equal(top.properties.archive.public_reference_code, "DI.01.aTop");

  const left = exhibitsById.get("exhibit_drawer_d002");
  assert.deepEqual(left.properties.fixture_alt_names, ["di_05_01_L1"]);
  assert.equal(left.properties.archive.public_reference_code, "DI.01.L1");

  const right = exhibitsById.get("exhibit_drawer_d007");
  assert.deepEqual(right.properties.fixture_alt_names, ["di_06_01_L3"]);
  assert.equal(right.properties.archive.public_reference_code, "DI.01.R3");
});

test("cabinet labels map directly to matching cabinet fixtures", () => {
  const label = exhibitsById.get("exhibit_label_face01_01");
  assert.deepEqual(label.properties.fixture_alt_names, ["col_1_cab_01"]);
  assert.equal(label.properties.archive.public_reference_code, "01.01");

  const face25 = exhibitsById.get("exhibit_label_face25_10");
  assert.deepEqual(face25.properties.fixture_alt_names, ["col_25_cab_10"]);
  assert.equal(face25.properties.source_cabinet_number, 10);
  assert.equal(face25.properties.physical_cabinet_number, 10);

  const face28 = exhibitsById.get("exhibit_label_face28_26");
  assert.deepEqual(face28.properties.fixture_alt_names, ["col_28_cab_26"]);
  assert.equal(face28.properties.source_cabinet_number, 26);
  assert.equal(face28.properties.physical_cabinet_number, 26);
});

test("missing label report ignores Col 2 and known blank public label slots", () => {
  const missingLabels = report.filter((item) => item.source_type === "label" && item.reason === "source_label_missing");
  assert.deepEqual(missingLabels, []);
});

test("active shadowboxes resolve through the public SVG transform and keep class", () => {
  const shadowbox = exhibitsById.get("exhibit_shadowbox_s002");
  assert.deepEqual(shadowbox.properties.fixture_alt_names, ["col_25_cab_16"]);
  assert.equal(shadowbox.properties.public_class, "herbarium");
  assert.equal(shadowbox.properties.archive.public_class, "herbarium");

  assert.equal(exhibitsById.has("exhibit_shadowbox_s001"), false);
  assert.equal(exhibitsById.has("exhibit_shadowbox_s030"), false);
});

test("archive layer preserves archived shadowboxes without displaying them", () => {
  assert.equal(archive.type, "FeatureCollection");
  assert.equal(archive.features.length, 11);
  assert.deepEqual(report, []);
  for (const feature of archive.features) {
    assert.equal(feature.feature_type, "exhibit");
    assert.equal(feature.geometry, null);
    assert.equal(feature.properties.duration_type, "archived");
    assert.equal(feature.properties.archive_status, "archived");
    assert.equal(feature.properties.exhibit_type, "shadowbox");
    assert.deepEqual(feature.properties.fixture_ids, []);
    assert.deepEqual(feature.properties.amenity_ids, []);
    assert.equal("public_map_distance_meters" in feature.properties, false);
    assert.equal("public_svg_x" in feature.properties.archive, false);
    assert.equal("public_svg_y" in feature.properties.archive, false);
  }
});
