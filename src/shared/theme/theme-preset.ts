import source from "./presets/default-light.json";
import { componentRecipes } from "./component-recipes";
import { radii } from "./radius";
import { semanticColors } from "./semantic-colors";
import { themeTypography } from "./theme-typography";
import type { AppThemePreset, ThemeMode } from "./theme.types";

function getThemeMode(mode: string): ThemeMode {
    if (mode === "light" || mode === "dark") return mode;
    throw new Error(`Unsupported theme mode: ${mode}`);
}

export const defaultThemePreset = Object.freeze({
    name: source.name,
    mode: getThemeMode(source.mode),
    colors: semanticColors,
    radii,
    spacing: source.spacing,
    typography: themeTypography,
    motion: source.motion,
    components: componentRecipes,
}) satisfies AppThemePreset;
