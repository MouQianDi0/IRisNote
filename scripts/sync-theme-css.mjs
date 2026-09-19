import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourcePath = path.join(
    projectRoot,
    "src",
    "shared",
    "theme",
    "presets",
    "default-light.json",
);
const cssPath = path.join(projectRoot, "global.css");
const startMarker = "    /* theme-sync:start */";
const endMarker = "    /* theme-sync:end */";

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

function paletteValue(reference, tokenName) {
    const value = source.palette[reference];
    if (value === undefined) {
        throw new Error(
            `CSS token ${tokenName} references missing palette value ${reference}.`,
        );
    }
    return value;
}

function radiusValue(reference, tokenName) {
    const [group, key] = reference.split(".");
    const value = source[group]?.[key];
    if (typeof value !== "number") {
        throw new Error(
            `CSS radius ${tokenName} references missing numeric value ${reference}.`,
        );
    }
    return `${value}px`;
}

function renderBlock() {
    const lines = [startMarker];
    for (const [name, reference] of Object.entries(
        source.nativewindColorRefs,
    )) {
        lines.push(`    --color-${name}: ${paletteValue(reference, name)};`);
    }
    lines.push("");
    for (const [name, reference] of Object.entries(
        source.nativewindRadiusRefs,
    )) {
        lines.push(`    --radius-${name}: ${radiusValue(reference, name)};`);
    }
    lines.push(endMarker);
    return lines.join("\n");
}

const css = fs.readFileSync(cssPath, "utf8");
const markerPattern = new RegExp(
    `${startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
);
const expected = renderBlock();

if (!markerPattern.test(css)) {
    throw new Error("global.css is missing the managed theme-sync block.");
}

if (process.argv.includes("--write")) {
    const newline = css.includes("\r\n") ? "\r\n" : "\n";
    const nextCss = css.replace(
        markerPattern,
        expected.replace(/\n/g, newline),
    );
    fs.writeFileSync(cssPath, nextCss, "utf8");
    console.log("global.css theme tokens synchronized.");
} else if (css.match(markerPattern)?.[0].replace(/\r\n/g, "\n") !== expected) {
    console.error("global.css theme tokens are stale. Run: npm run theme:sync");
    process.exitCode = 1;
} else {
    console.log("global.css theme tokens match the default theme preset.");
}
