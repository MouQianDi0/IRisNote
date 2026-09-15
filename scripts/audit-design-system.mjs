import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDirectory, "..", "src");
const themeRoot = path.join(sourceRoot, "shared", "theme");

function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourceFiles(fullPath);
        return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
    });
}

const files = sourceFiles(sourceRoot);
const metrics = {
    sourceFiles: files.length,
    sourceLines: 0,
    hardcodedColorsOutsideTheme: 0,
    rawFontSizes: 0,
    rawBorderRadii: 0,
    arbitraryClassLines: 0,
    tappableFiles: 0,
    textInputFiles: 0,
};
const offenders = {
    hardcodedColorsOutsideTheme: [],
    rawFontSizes: [],
    rawBorderRadii: [],
    arbitraryClassLines: [],
};

function countMatches(content, pattern) {
    return content.match(pattern)?.length ?? 0;
}

for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
    metrics.sourceLines += lines.length;
    if (!file.startsWith(themeRoot)) {
        const count = countMatches(content, /#[0-9a-fA-F]{3,8}\b/g);
        metrics.hardcodedColorsOutsideTheme += count;
        if (count) {
            offenders.hardcodedColorsOutsideTheme.push({
                file: relativeFile,
                count,
            });
        }
        const fontSizeCount = countMatches(content, /fontSize\s*:/g);
        const borderRadiusCount = countMatches(content, /borderRadius\s*:/g);
        const arbitraryClassCount = lines.filter(
            (line) => /className=.*\[[^\]]+\]/.test(line),
        ).length;
        metrics.rawFontSizes += fontSizeCount;
        metrics.rawBorderRadii += borderRadiusCount;
        metrics.arbitraryClassLines += arbitraryClassCount;
        if (fontSizeCount) {
            offenders.rawFontSizes.push({
                file: relativeFile,
                count: fontSizeCount,
            });
        }
        if (borderRadiusCount) {
            offenders.rawBorderRadii.push({
                file: relativeFile,
                count: borderRadiusCount,
            });
        }
        if (arbitraryClassCount) {
            offenders.arbitraryClassLines.push({
                file: relativeFile,
                count: arbitraryClassCount,
            });
        }
    }
    if (/<(?:Pressable|TouchableOpacity)\b/.test(content)) {
        metrics.tappableFiles += 1;
    }
    if (/<TextInput\b/.test(content)) metrics.textInputFiles += 1;
}

for (const entries of Object.values(offenders)) {
    entries.sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
}

console.log(
    JSON.stringify(
        {
            metrics,
            topOffenders: Object.fromEntries(
                Object.entries(offenders).map(([name, entries]) => [
                    name,
                    entries.slice(0, 5),
                ]),
            ),
        },
        null,
        2,
    ),
);
