// Rasterize the code-owned SVG path using the already installed PNG encoder.
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const root = path.resolve(__dirname, "..");
const svg = fs.readFileSync(
  path.join(root, "assets/images/notification-icon.svg"),
  "utf8",
);
const d = svg.match(/ d="([^"]+)"/)[1];
const tokens = d.match(/[Mhvz]|-?\d+/g);
const polygons = [];
let polygon = [],
  x = 0,
  y = 0;
for (let i = 0; i < tokens.length;) {
  const op = tokens[i++];
  if (op === "M") {
    x = Number(tokens[i++]);
    y = Number(tokens[i++]);
    polygon = [[x, y]];
  } else if (op === "h") {
    x += Number(tokens[i++]);
    polygon.push([x, y]);
  } else if (op === "v") {
    y += Number(tokens[i++]);
    polygon.push([x, y]);
  } else if (op === "z") {
    polygons.push(polygon);
  } else throw new Error(`Unsupported SVG instruction: ${op}`);
}
function inside(px, py, points) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[i],
      [bx, by] = points[j];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax)
      result = !result;
  }
  return result;
}
const png = new PNG({ width: 96, height: 96 });
for (let py = 0; py < 96; py++)
  for (let px = 0; px < 96; px++) {
    const index = (py * 96 + px) * 4;
    png.data[index] = png.data[index + 1] = png.data[index + 2] = 255;
    png.data[index + 3] = polygons.reduce(
      (on, points) => on !== inside(px + 0.5, py + 0.5, points),
      false,
    )
      ? 255
      : 0;
  }
fs.writeFileSync(
  path.join(root, "assets/images/notification-icon.png"),
  PNG.sync.write(png),
);
