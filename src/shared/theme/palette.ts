import source from "./presets/default-light.json";

export const palette = Object.freeze(source.palette);

function resolvePaletteRefs<T extends Record<string, string>>(refs: T) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries(refs).map(([name, paletteName]) => {
                const value = palette[paletteName as keyof typeof palette];
                if (value === undefined) {
                    throw new Error(
                        `Theme color \"${name}\" references missing palette value \"${paletteName}\".`,
                    );
                }
                return [name, value];
            }),
        ) as { readonly [K in keyof T]: string },
    );
}

export const legacyColors = resolvePaletteRefs(source.legacyColorRefs);
export const resolvedSemanticColors = resolvePaletteRefs(
    source.semanticColorRefs,
);
