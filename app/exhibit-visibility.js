// Display policy is independent of search, fixture associations and routing.
// Individual records may override the default with map_display.
export function exhibitMarkerVisible(feature, selectedId) {
  const properties = feature.properties || {};
  if ((properties.viewer_layer || feature.feature_type) !== 'exhibit') return true;
  if (feature.id === selectedId) return true;
  const display = properties.map_display || (properties.exhibit_type === 'label' ? 'selection-only' : 'always');
  return display !== 'selection-only';
}
