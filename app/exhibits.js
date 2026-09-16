function drawerStackAltNames(altName) {
  const match = altName?.match(/^(di_\d+_\d+)_(top|L1|L2|L3)(?:_exhibits)?$/);
  if (!match) return [];
  const suffix = altName.endsWith("_exhibits") ? "_exhibits" : "";
  return ["top", "L1", "L2", "L3"].map((level) => `${match[1]}_${level}${suffix}`);
}


export function relatedExhibitsForFeature(feature, collection) {
  if (!feature || !collection?.features) return [];
  const selected = feature.properties || {};
  const selectedId = feature.id || selected.viewer_feature_id;
  const fixtureIds = new Set([selectedId, selected.related_fixture_id, ...(selected.fixture_ids || [])].filter(Boolean));
  const amenityIds = new Set([selectedId, ...(selected.amenity_ids || [])].filter(Boolean));
  const altName = selected.alt_name?.en;
  const fixtureAltNames = new Set([altName, ...drawerStackAltNames(altName), ...(selected.fixture_alt_names || [])].filter(Boolean));
  const amenityAltNames = new Set([altName, ...drawerStackAltNames(altName), ...(selected.amenity_alt_names || [])].filter(Boolean));
  return collection.features
    .filter((candidate) => (candidate.properties?.viewer_layer || candidate.feature_type) === "exhibit")
    .filter((candidate) => {
      const properties = candidate.properties;
      return candidate.id === selectedId
        || selected.exhibit_ids?.includes(candidate.id)
        || properties.detail_ids?.includes(selectedId)
        || properties.fixture_ids?.some((id) => fixtureIds.has(id))
        || properties.amenity_ids?.some((id) => amenityIds.has(id))
        || properties.fixture_alt_names?.some((name) => fixtureAltNames.has(name))
        || properties.amenity_alt_names?.some((name) => amenityAltNames.has(name));
    })
    .sort((a, b) => (a.properties.archive?.public_reference_code || a.id).localeCompare(b.properties.archive?.public_reference_code || b.id, undefined, { numeric: true }));
}
