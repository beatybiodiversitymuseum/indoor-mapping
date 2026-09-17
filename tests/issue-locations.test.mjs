import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRoutingNetwork, fixtureRouteId, isRoutableFeature, findApprovedRoute } from "../app/routing.js";

const read = async (name) => JSON.parse(await readFile(new URL(`../geojson/${name}.geojson`, import.meta.url), "utf8")).features;
const [amenities, openings, fixtures, navigation, exhibits] = await Promise.all(["amenity", "opening", "fixture", "navigation", "exhibit"].map(read));
const network = buildRoutingNetwork({ features: navigation });
const submitted = exhibits.filter((feature) => feature.properties.exhibit_type === "window");
const byIssue = new Map([...amenities, ...openings, ...exhibits].map((feature) => [feature.properties.source_issue_number, feature]));


test("submitted cabinet windows use cabinet faces and separate navigation points", () => {
  assert.equal(submitted.length, 193);
  assert.equal(amenities.some((feature) => /Window/.test(feature.properties.name?.en)), false);
  for (const feature of submitted) {
    assert.equal(feature.feature_type, "exhibit");
    assert.equal(feature.properties.duration_type, "permanent");
    assert.equal(feature.properties.exhibit_type, "window");
    assert.ok(feature.properties.fixture_ids.length);
    assert.equal(feature.properties.amenity_ids, undefined);
    assert.ok(feature.properties.navigation_point_ids.length);
  }
  for (const feature of submitted) {
    const properties = feature.properties;
    const fixture = fixtures.find((item) => item.id === properties.related_fixture_id);
    const viewing = navigation.find((item) => item.properties.wayfinding_type === "viewing_stop" && item.properties.related_fixture_id === fixture.id);
    assert.notDeepEqual(feature.geometry.coordinates, viewing.geometry.coordinates);
    assert.equal(fixtureRouteId(feature), fixture.properties.alt_name.en);
    assert.ok(isRoutableFeature(network, feature));

  }
  assert.equal(byIssue.get(118).properties.route_fixture_id, "col_48_cab_17");
  assert.deepEqual(byIssue.get(118).geometry, byIssue.get(117).geometry);
});

test("ticket windows and cabinet viewing amenities reuse approved routing", () => {
  const start = byIssue.get(81), end = byIssue.get(118);
  const route = findApprovedRoute(network, start, end);
  assert.ok(route?.distanceMeters > 0);
  const viewing = navigation.find((feature) => feature.properties.related_fixture_id === start.properties.related_fixture_id && feature.properties.wayfinding_type === "viewing_stop");
  assert.equal(findApprovedRoute(network, viewing, end).distanceMeters, route.distanceMeters);
});

test("doorway corrections retain original coordinates and submitted door lines", () => {
  for (const number of [35, 37, 38]) {
    const feature = byIssue.get(number);
    assert.notDeepEqual(feature.geometry.coordinates, feature.properties.location_correction.original_coordinates);
    assert.ok(feature.properties.location_correction.reference_feature_ids.length);
  }
  const door = byIssue.get(229);
  assert.equal(door.feature_type, "opening");
  assert.equal(door.properties.submitted_geometry.type, "LineString");
  const [a, b] = door.properties.submitted_geometry.coordinates;
  assert.ok(Math.abs(door.geometry.coordinates[0] - (a[0] + b[0]) / 2) < 1e-8);
  assert.ok(Math.abs(door.geometry.coordinates[1] - (a[1] + b[1]) / 2) < 1e-8);
});

test("all photo transcriptions preserve their ticket association and evidence URL", () => {
  const photos = [...amenities, ...openings, ...exhibits, ...fixtures].flatMap((feature) => {
    const entries = feature.properties.image_transcriptions || [];
    for (const entry of entries) {
      assert.equal(entry.issue_number, feature.properties.source_issue_number);
      assert.equal(entry.review_status, "machine_transcribed_unreviewed");
      assert.match(entry.image_url, /^https:\/\/github.com\/user-attachments\/assets\//);
    }
    return entries;
  });
  assert.equal(photos.length, 390);
  assert.match(byIssue.get(74).properties.image_transcriptions[0].text, /Physiological adaptations to the environment in fishes/);
});

test("detail OCR replaces the noisy overview in exhibit text", () => {
  const exhibit = byIssue.get(117);
  const [overview, detail] = exhibit.properties.image_transcriptions;
  assert.ok(exhibit.properties.photo_text.includes("Myoxocephalus thompsonii"));
  assert.ok(detail.text.startsWith(exhibit.properties.details.text.en));
  assert.equal(exhibit.properties.specimens.length, 2);
  assert.equal(exhibit.properties.specimens[0].scientificName, "Myoxocephalus thompsonii");
  assert.notEqual(exhibit.properties.details.text.en, overview.text);
  assert.equal(exhibit.properties.photo_text_source_url, detail.image_url);
  assert.equal(exhibit.properties.image.url, overview.image_url);
  assert.equal(byIssue.get(101).properties.photo_text_source_url, byIssue.get(101).properties.image_transcriptions[1].image_url);
});


test("selecting an existing cabinet label also exposes its window narrative", async () => {
  const { relatedExhibitsForFeature } = await import("../app/exhibits.js");
  for (const [code, phrase] of [["46.11", "grunting noise"], ["43.12", "largest family"]]) {
    const label = exhibits.find((feature) => feature.properties.name.en === `Cabinet Face ${code}`);
    const related = relatedExhibitsForFeature(label, { features: exhibits });
    const window = related.find((feature) => feature.properties.name.en === `Cabinet ${code} Window`);
    assert.ok(window, code);
    assert.ok(window.properties.details.text.en.includes(phrase));
  }
});


test("window 46.11 uses standard exhibit specimen fields without losing its narrative", () => {
  const props = byIssue.get(133).properties;
  assert.match(props.details.text.en, /grunting noise/);
  assert.equal(props.details.text.en.includes("1. Chere-chere"), false);
  assert.equal(props.specimens.length, 4);
  assert.deepEqual(props.specimens[0], {
    scientificName: "Haemulon steindachneri", commonName: "Chere-chere grunt",
    specimenType: null, presence: null, catalogNumber: "BC57-0106",
    notes: "Santiago Bay, Mexico, 1957",
  });
  assert.equal(props.details.notes, undefined);
  assert.equal(props.fixture_id, props.fixture_ids[0]);
});


test("unreadable OCR is hidden and readable details replace it", () => {
  for (const issue of [81, 82, 87, 89, 97, 114, 201, 225, 258, 277, 283, 284]) {
    const props = byIssue.get(issue).properties;
    assert.equal(props.details.text.en, "", String(issue));
    assert.equal(props.photo_text, "", String(issue));
    assert.deepEqual(props.specimens, []);
  }
  assert.match(byIssue.get(170).properties.details.text.en, /largest family/);
  assert.match(byIssue.get(209).properties.details.text.en, /shark/);
  assert.doesNotMatch(byIssue.get(209).properties.photo_text, /Caveharhiners/);
  assert.doesNotMatch(byIssue.get(133).properties.photo_text, /EBathy|rimator/);
});


test("46.12 retains family identification and separates the fifth specimen", () => {
  const props = byIssue.get(134).properties;
  assert.equal(props.exhibit_type, "cabinet_display");
  assert.equal(props.map_display, "selection-only");
  assert.deepEqual(props.specimens.map(s => s.scientificName), [
    "Scaridae", "Zanclus cornutus", "Acanthurus triostegus",
    "Centropyge flavissimus", "Rhinecanthus aculeatus",
  ]);
  assert.equal(props.specimens[0].commonName, "Parrotfish");
  assert.equal(props.specimens[4].commonName, "White-banded triggerfish");
  assert.equal(props.specimens[4].catalogNumber, "BC72-0041");
  assert.doesNotMatch(props.specimens[3].notes, /triggerfish/);
});

test("Irish elk skull remains on top of and browsable through cabinet 01.03", () => {
  const exhibit = byIssue.get(286);
  const props = exhibit.properties;
  const fixture = fixtures.find((item) => item.properties.alt_name?.en === "col_1_cab_03");
  assert.deepEqual(props.fixture_ids, [fixture.id]);
  assert.equal(props.fixture_placement, "top");
  assert.equal(props.route_fixture_id, "col_1_cab_03");
  assert.ok(props.stopping_point_ids.length);
  assert.deepEqual(exhibit.geometry.coordinates, [-123.2510217, 49.2633962]);
  assert.equal(props.photo_text, "");
});
