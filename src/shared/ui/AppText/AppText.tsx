import {
    semanticColors,
    themeTypography,
    type AppTypography,
} from "@/shared/theme";
import { Text, type TextProps } from "react-native";

export type AppTextVariant = keyof AppTypography;
export type AppTextTone =
    | "primary"
    | "secondary"
    | "disabled"
    | "brand"
    | "primaryFaded"
    | "onBrand"
    | "onPrimaryDisabled"
    | "danger"
    | "onDanger"
    | "onDestructiveDisabled";

const toneColors: Record<AppTextTone, string> = {
    primary: semanticColors.textPrimary,
    secondary: semanticColors.textSecondary,
    disabled: semanticColors.textDisabled,
    brand: semanticColors.brandPrimary,
    primaryFaded: semanticColors.primaryFaded,
    onBrand: semanticColors.onBrandPrimary,
    onPrimaryDisabled: semanticColors.onPrimaryDisabled,
    danger: semanticColors.destructive,
    onDanger: semanticColors.onDestructive,
    onDestructiveDisabled: semanticColors.onDestructiveDisabled,
};

export type AppTextProps = Omit<TextProps, "style"> & {
    variant?: AppTextVariant;
    tone?: AppTextTone;
    className?: string;
};

/**
 * Application text primitive. Callers choose semantic typography and color;
 * visual identity stays in the active theme preset.
 */
export function AppText({
    variant = "body",
    tone = "primary",
    ...props
}: AppTextProps) {
    return (
        <Text
            {...props}
            style={[themeTypography[variant], { color: toneColors[tone] }]}
        />
    );
}
