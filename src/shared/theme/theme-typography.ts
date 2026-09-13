import type { TextStyle } from "react-native";
import source from "./presets/default-light.json";
import type { AppTypography } from "./theme.types";

const regular = source.typography.weight.regular as TextStyle["fontWeight"];
const medium = source.typography.weight.medium as TextStyle["fontWeight"];

export const themeTypography = Object.freeze({
    caption: {
        fontSize: source.typography.size.small,
        fontWeight: regular,
    },
    helper: {
        fontSize: source.typography.size.label,
        fontWeight: regular,
    },
    label: {
        fontSize: source.typography.size.label,
        fontWeight: medium,
    },
    body: {
        fontSize: source.typography.size.control,
        fontWeight: regular,
    },
    control: {
        fontSize: source.typography.size.control,
        fontWeight: regular,
    },
    title: {
        fontSize: source.typography.size.headline,
        fontWeight: regular,
    },
}) satisfies AppTypography;
