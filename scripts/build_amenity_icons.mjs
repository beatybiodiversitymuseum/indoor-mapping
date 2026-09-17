import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Accessibility, Armchair, DoorClosed, DoorOpen, Droplets, FireExtinguisher, LogOut, Microscope, Presentation, Projector, Toilet, Trash2, Wrench } from "lucide-react";
import sharp from "sharp";

const icons = {
  "fire-extinguisher": [FireExtinguisher, "#c83f3f"],
  toilet: [Toilet, "#3979a8"],
  trash: [Trash2, "#547069"],
  sink: [Droplets, "#367f9b"],
  seating: [Armchair, "#76639a"],
  microscope: [Microscope, "#596574"],
};

const output = path.join(process.cwd(), "public", "amenity-icons");
await mkdir(output, { recursive: true });

for (const [name, [Icon, color]] of Object.entries(icons)) {
  const markup = renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 48 48" },
    createElement("circle", { cx: 24, cy: 24, r: 22, fill: color, stroke: "#fff", strokeWidth: 2 }),
    createElement(Icon, { x: 11, y: 11, width: 26, height: 26, color: "#fff", strokeWidth: 2.25 }),
  ));
  await writeFile(path.join(output, `${name}.svg`), markup);
  await sharp(Buffer.from(markup)).png().toFile(path.join(output, `${name}.png`));
}

const pointFeatureIcons = {
  door: [DoorOpen, "#b06a38"],
  "emergency-exit": [LogOut, "#b94242"],
  "accessible-entrance": [Accessibility, "#3979a8"],
  "staff-door": [DoorClosed, "#76634d"],
  table: [PhysicalTable, "#65717a"],
  projector: [Projector, "#5b638f"],
  screen: [Presentation, "#596574"],
  fixture: [Wrench, "#65717a"],
};

function PhysicalTable({ x, y, width, height, color, strokeWidth }) {
  return createElement("svg", { x, y, width, height, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" },
    createElement("path", { d: "M3 7.5h18v4H3z" }),
    createElement("path", { d: "M6 11.5v7M18 11.5v7M4.5 18.5h3M16.5 18.5h3" }),
  );
}

const pointFeatureOutput = path.join(process.cwd(), "public", "point-feature-icons");
await mkdir(pointFeatureOutput, { recursive: true });
for (const [name, [Icon, color]] of Object.entries(pointFeatureIcons)) {
  const markup = renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 48 48" },
    createElement("circle", { cx: 24, cy: 24, r: 22, fill: color, stroke: "#fff", strokeWidth: 2 }),
    createElement(Icon, { x: 11, y: 11, width: 26, height: 26, color: "#fff", strokeWidth: 2.25 }),
  ));
  await writeFile(path.join(pointFeatureOutput, `${name}.svg`), markup);
  await sharp(Buffer.from(markup)).png().toFile(path.join(pointFeatureOutput, `${name}.png`));
}
