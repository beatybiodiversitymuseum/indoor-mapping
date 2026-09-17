import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generatedJunctionFeatures } from "../app/navigation-data.js";

const read = async (name) => JSON.parse(await readFile(new URL(`../geojson/${name}.geojson`, import.meta.url), "utf8"));
const [paths, access, stops, units] = await Promise.all(["navigation_path", "navigation_access", "navigation_stop", "unit"].map(read));

test("navigation extensions separate paths, access projections and viewing stops", () => {
  assert.equal(paths.features.length, 151);
  assert.equal(access.features.length, 851);
  assert.equal(stops.features.length, 1258);
  assert.ok(paths.features.every((feature) => feature.properties.wayfinding_type === "walking_path"));
  assert.ok(access.features.every((feature) => feature.properties.wayfinding_type === "access_projection"));
  assert.ok(stops.features.every((feature) => feature.properties.wayfinding_type === "viewing_stop"));
});

test("all Discovery Lab table branches join one spine and the door reaches PATH-001", () => {
  const lab = paths.features.filter((feature) => /^PATH-2(?:1[5-9]|2[0-5])$/.test(feature.properties.debug_id));
  assert.equal(lab.length, 11);
  const pathOne = paths.features.find((feature) => feature.properties.debug_id === "PATH-001");
  const vector = (feature) => {
    const [a, b] = feature.geometry.coordinates;
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    return [(b[0] - a[0]) * Math.cos(latitude), b[1] - a[1]];
  };
  const reference = vector(pathOne);
  for (const feature of lab) {
    const candidate = vector(feature);
    const dot = reference[0] * candidate[0] + reference[1] * candidate[1];
    const cross = reference[0] * candidate[1] - reference[1] * candidate[0];
    const scale = Math.hypot(...reference) * Math.hypot(...candidate);
    assert.ok(Math.min(Math.abs(dot), Math.abs(cross)) / scale < 1e-5);
  }
  const accessSources = new Set(access.features.flatMap((feature) => feature.properties.sources || []));
  for (let table = 1; table <= 8; table++) assert.ok(accessSources.has(`discovery_lab_table_${table}`));
  assert.ok(accessSources.has("discovery_lab_doors"));
});

test("the ramp route stays centered and uses only parallel or perpendicular segments", () => {
  const ramp = paths.features.filter((feature) => /^PATH-21[0-4]$/.test(feature.properties.debug_id));
  assert.equal(ramp.length, 5);
  const vectors = ramp.map((feature) => {
    const [a, b] = feature.geometry.coordinates;
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    return [(b[0] - a[0]) * Math.cos(latitude), b[1] - a[1]];
  });
  for (let index = 1; index < vectors.length; index++) {
    const [a, b] = [vectors[index - 1], vectors[index]];
    const dot = a[0] * b[0] + a[1] * b[1];
    const cross = a[0] * b[1] - a[1] * b[0];
    const scale = Math.hypot(...a) * Math.hypot(...b);
    assert.ok(Math.min(Math.abs(dot), Math.abs(cross)) / scale < 1e-5);
  }
});

test("PATH-213 turns beyond the end of the ramp wall", () => {
  const path = paths.features.find((feature) => feature.properties.debug_id === "PATH-213").geometry.coordinates;
  const wall = units.features.find((feature) => feature.id === "f70cefd3-a355-4221-8129-5cb70ae3a701").geometry.coordinates[0];
  const orientation = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const intersects = (a, b, c, d) => {
    const [first, second, third, fourth] = [orientation(a, b, c), orientation(a, b, d), orientation(c, d, a), orientation(c, d, b)];
    return first * second <= 0 && third * fourth <= 0;
  };
  for (let index = 0; index < wall.length - 1; index++) assert.equal(intersects(path[0], path.at(-1), wall[index], wall[index + 1]), false);
});

test("the whale connects at its centre and north side to PATH-004", () => {
  const feature = (id) => paths.features.find((item) => item.properties.debug_id === id);
  const line = (id) => feature(id).geometry.coordinates;
  const latitude = 49.2633 * Math.PI / 180;
  const point = ([longitude, latitudeValue]) => [longitude * Math.cos(latitude), latitudeValue];
  const onSegment = (candidate, [start, end]) => {
    const [p, a, b] = [candidate, start, end].map(point);
    const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    const dot = (p[0] - a[0]) * (p[0] - b[0]) + (p[1] - a[1]) * (p[1] - b[1]);
    return Math.abs(cross) < 1e-12 && dot <= 1e-12;
  };
  const centreJoin = line("PATH-226");
  const northJoin = line("PATH-227");
  assert.deepEqual(line("PATH-214").at(-1), northJoin[0]);
  assert.ok(onSegment(centreJoin.at(-1), line("PATH-004")));
  assert.ok(onSegment(northJoin.at(-1), line("PATH-004")));
});

test("PATH-231 joins PATH-069 north and PATH-069 joins PATH-214 west", () => {
  const line = (id) => paths.features.find((item) => item.properties.debug_id === id).geometry.coordinates;
  const path238 = line("PATH-238");
  const path239 = line("PATH-239");
  assert.deepEqual(path238[0], line("PATH-231").at(-1));
  assert.deepEqual(path238.at(-1), line("PATH-069")[0]);
  assert.deepEqual(path239[0], line("PATH-069").at(-1));
  const endpoint = path239.at(-1);
  const path214 = line("PATH-214");
  const latitude = endpoint[1] * Math.PI / 180;
  const distance = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(latitude), a[1] - b[1]);
  assert.ok(Math.abs(distance(path214[0], endpoint) + distance(endpoint, path214.at(-1)) - distance(path214[0], path214.at(-1))) < 1e-10);
});

test("Discovery Lab sink and microscope join the straight central spine", () => {
  const feature = (id) => paths.features.find((item) => item.properties.debug_id === id);
  const spine = feature("PATH-215").geometry.coordinates;
  const vector = ([a, b]) => {
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    return [(b[0] - a[0]) * Math.cos(latitude), b[1] - a[1]];
  };
  const spineVector = vector(spine);
  for (const id of ["PATH-228", "PATH-229"]) {
    const branch = feature(id).geometry.coordinates;
    const branchVector = vector(branch);
    const dot = spineVector[0] * branchVector[0] + spineVector[1] * branchVector[1];
    const scale = Math.hypot(...spineVector) * Math.hypot(...branchVector);
    assert.ok(Math.abs(dot) / scale < 1e-5);
    const endpoint = branch.at(-1);
    const distance = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(latitude), a[1] - b[1]);
    const latitude = endpoint[1] * Math.PI / 180;
    assert.ok(Math.abs(distance(spine[0], endpoint) + distance(endpoint, spine.at(-1)) - distance(spine[0], spine.at(-1))) < 1e-10);
  }
  const accessSources = new Set(access.features.flatMap((item) => item.properties.sources || []));
  assert.ok(accessSources.has("discovery_lab_sink"));
  assert.ok(accessSources.has("discovery_lab_microscope"));
});

test("theatre doors and accessibility ramp use only map-aligned joins", () => {
  const feature = (id) => paths.features.find((item) => item.properties.debug_id === id);
  const vector = (item) => {
    const [a, b] = item.geometry.coordinates;
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    return [(b[0] - a[0]) * Math.cos(latitude), b[1] - a[1]];
  };
  const reference = vector(feature("PATH-213"));
  for (let number = 230; number <= 235; number++) {
    const candidate = vector(feature(`PATH-${number}`));
    const dot = reference[0] * candidate[0] + reference[1] * candidate[1];
    const cross = reference[0] * candidate[1] - reference[1] * candidate[0];
    const scale = Math.hypot(...reference) * Math.hypot(...candidate);
    assert.ok(Math.min(Math.abs(dot), Math.abs(cross)) / scale < 1e-5);
  }
  const accessSources = new Set(access.features.flatMap((item) => item.properties.sources || []));
  for (const source of ["theatre_west_doors", "theatre_east_doors", "theatre_accessibility_ramp_entrance", "theatre_accessibility_ramp_exit"]) assert.ok(accessSources.has(source));
});

test("the Discovery Lab emergency exit uses only exact lab-axis segments", () => {
  const feature = (id) => paths.features.find((item) => item.properties.debug_id === id);
  const segments = [feature("PATH-236"), feature("PATH-237")];
  const spine = feature("PATH-215");
  const mercator = ([longitude, latitude]) => {
    const longitudeRadians = longitude * Math.PI / 180;
    const latitudeRadians = latitude * Math.PI / 180;
    return [longitudeRadians, Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))];
  };
  const vector = (item) => {
    const [a, b] = item.geometry.coordinates.map(mercator);
    return [b[0] - a[0], b[1] - a[1]];
  };
  const reference = vector(spine);
  for (const segment of segments) {
    const candidate = vector(segment);
    const dot = reference[0] * candidate[0] + reference[1] * candidate[1];
    const cross = reference[0] * candidate[1] - reference[1] * candidate[0];
    const scale = Math.hypot(...reference) * Math.hypot(...candidate);
    assert.ok(Math.min(Math.abs(dot), Math.abs(cross)) / scale < 1e-8);
  }
  assert.deepEqual(segments[0].geometry.coordinates[0], [-123.25017470000026, 49.263749800000156]);
  assert.deepEqual(segments[0].geometry.coordinates.at(-1), segments[1].geometry.coordinates[0]);
  assert.deepEqual(segments[1].geometry.coordinates.at(-1), [-123.25015945000656, 49.26372720000399]);
  const accessSources = new Set(access.features.flatMap((item) => item.properties.sources || []));
  assert.ok(accessSources.has("discovery_lab_emergency_exit"));
});

test("access projections do not duplicate a physical position on the same path", () => {
  const meters = (a, b) => {
    const latitude = ((a[1] + b[1]) / 2) * Math.PI / 180;
    return Math.hypot((b[0] - a[0]) * Math.cos(latitude) * 6371000 * Math.PI / 180, (b[1] - a[1]) * 6371000 * Math.PI / 180);
  };
  for (let first = 0; first < access.features.length; first++) for (let second = 0; second < first; second++) {
    const a = access.features[first];
    const b = access.features[second];
    if (a.properties.target === b.properties.target) assert.ok(meters(a.geometry.coordinates, b.geometry.coordinates) > 0.1);
  }
});

test("junctions are generated and viewing stops have unique physical positions", () => {
  assert.equal(generatedJunctionFeatures(paths).length, 215);
  const positions = stops.features.map((feature) => JSON.stringify(feature.geometry.coordinates));
  assert.equal(new Set(positions).size, positions.length);
});
