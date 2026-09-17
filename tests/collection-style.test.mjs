import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { COLLECTIONS, COLLECTION_BADGE_SIZE, COLLECTION_BADGE_SCALE, cabinetGroup, collectionBadgeFeatures, collectionBadgeIconOffset, collectionForFixture, collectionSectionFeatures, drawerGroup } from "../app/collection-style.js";

const fixture = (face) => ({ properties: { alt_name: { en: `col_${face}_cab_01` } } });

test("cabinet faces map into the 26 physical left-right groups", () => {
  assert.equal(cabinetGroup(fixture(1)), 1);
  assert.equal(cabinetGroup(fixture(2)), 1);
  assert.equal(cabinetGroup(fixture(51)), 26);
  assert.equal(cabinetGroup(fixture(52)), 26);
});

test("drawer identifiers inherit the group of their matching cabinet face", () => {
  const drawer = (face) => ({ properties: { alt_name: { en: `di_${String(face).padStart(2, "0")}_01_L1` } } });
  assert.equal(drawerGroup(drawer(5)), 3);
  assert.equal(collectionForFixture(drawer(5))?.id, "vertebrate");
  assert.equal(collectionForFixture(drawer(11))?.id, "marine");
  assert.equal(collectionForFixture(drawer(36))?.id, "herbarium");
  assert.equal(collectionForFixture(drawer(37))?.id, "entomology");
  assert.equal(collectionForFixture(drawer(52))?.id, "fossil");
});

test("cabinet groups map to the requested collections at every boundary", () => {
  const expected = [
    [1, "vertebrate"], [10, "vertebrate"],
    [11, "marine"], [12, "marine"],
    [13, "herbarium"], [36, "herbarium"],
    [37, "entomology"], [38, "entomology"],
    [39, "fish"], [50, "fish"],
    [51, "fossil"], [52, "fossil"],
  ];
  for (const [face, collection] of expected) assert.equal(collectionForFixture(fixture(face))?.id, collection);
});

test("the fixture data produces one floor badge per collection", async () => {
  const data = JSON.parse(await readFile(new URL("../geojson/fixture.geojson", import.meta.url), "utf8"));
  const badges = collectionBadgeFeatures(data);
  assert.deepEqual(badges.features.map(({ properties }) => properties.collection), COLLECTIONS.map(({ id }) => id));
  for (const badge of badges.features) {
    assert.equal(badge.geometry.type, "Point");
    assert.ok(badge.geometry.coordinates.every(Number.isFinite));
  }
});

test("badge centers move outward by their displayed radius", () => {
  assert.deepEqual(collectionBadgeIconOffset, [0, COLLECTION_BADGE_SIZE / 2]);
  assert.equal(collectionBadgeIconOffset[1] * COLLECTION_BADGE_SCALE.min, COLLECTION_BADGE_SIZE * COLLECTION_BADGE_SCALE.min / 2);
  assert.equal(collectionBadgeIconOffset[1] * COLLECTION_BADGE_SCALE.max, COLLECTION_BADGE_SIZE * COLLECTION_BADGE_SCALE.max / 2);
});

test("collection sections form six closed floor polygons", async () => {
  const data = JSON.parse(await readFile(new URL("../geojson/fixture.geojson", import.meta.url), "utf8"));
  const sections = collectionSectionFeatures(data);
  assert.equal(sections.features.length, COLLECTIONS.length);
  for (const section of sections.features) {
    const ring = section.geometry.coordinates[0];
    assert.equal(section.geometry.type, "Polygon");
    assert.deepEqual(ring[0], ring.at(-1));
    assert.ok(section.properties.color);
  }
  for (let index = 1; index < sections.features.length; index++) {
    const previous = sections.features[index - 1].geometry.coordinates[0];
    const current = sections.features[index].geometry.coordinates[0];
    assert.deepEqual(previous[2], current[3], "adjacent sections share their north boundary point");
  }
});
