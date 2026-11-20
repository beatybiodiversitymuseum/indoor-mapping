import { AMENITY_ICON_IDS } from "./amenity-style.js";
import { POINT_FEATURE_ICON_IDS } from "./point-feature-style.js";

const label = (id) => id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const options = (ids, directory) => ids.map((id) => ({ id: `${directory}/${id}`, label: label(id), url: `/map/${directory}/${id}.png` }));
export const MAP_ICON_OPTIONS = [
  ...options(POINT_FEATURE_ICON_IDS, "point-feature-icons"),
  ...options(AMENITY_ICON_IDS, "amenity-icons"),
];
export const mapIconOption = (id) => MAP_ICON_OPTIONS.find((option) => option.id === id);
