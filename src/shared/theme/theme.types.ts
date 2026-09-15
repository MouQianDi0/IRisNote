import type { TextStyle } from "react-native";

export type ThemeMode = "light" | "dark";

export type SemanticColors = {
    transparent: string;
    brandPrimary: string;
    onBrandPrimary: string;
    pageBackground: string;
    surface: string;
    surfaceMuted: string;
    surfaceControl: string;
    surfaceSelected: string;
    surfaceList: string;
    surfaceListSelected: string;
    textPrimary: string;
    textSecondary: string;
    textDisabled: string;
    borderDefault: string;
    borderFocused: string;
    borderSelected: string;
    destructive: string;
    onDestructive: string;
    warning: string;
    success: string;
    primaryDisabled: string;
    secondaryDisabled: string;
    destructiveDisabled: string;
    onPrimaryDisabled: string;
    onDestructiveDisabled: string;
    primaryFaded: string;
    divider: string;
    scrim: string;
};

export type AppRadii = {
    indicator: number;
    control: number;
    iconControl: number;
    field: number;
    iconCell: number;
    card: number;
    progressBubble: number;
    editorToolbar: number;
    floating: number;
    dialog: number;
    full: number;
};

export type ComponentStateColors = {
    background: string;
    content: string;
    border?: string;
};

export type ComponentRecipes = {
    button: Record<
        "primary" | "secondary" | "tonal" | "danger" | "text",
        { default: ComponentStateColors; disabled: ComponentStateColors }
    >;
    iconButton: Record<
        "ghost" | "tonal" | "selected",
        { default: ComponentStateColors; disabled: ComponentStateColors }
    >;
    input: Record<
        "default" | "focused" | "invalid" | "disabled" | "readOnly",
        ComponentStateColors
    >;
    inlineHint: Record<"neutral" | "important", ComponentStateColors>;
    iconPickerCell: Record<
        "default" | "selected" | "disabled",
        ComponentStateColors
    >;
    progressBubble: ComponentStateColors;
};

export type AppTypography = Record<
    "caption" | "helper" | "label" | "body" | "control" | "title",
    TextStyle
>;

export type AppThemePreset = {
    name: string;
    mode: ThemeMode;
    colors: SemanticColors;
    radii: AppRadii;
    spacing: Record<string, number>;
    typography: AppTypography;
    motion: {
        pressedOpacity: number;
        fastDuration: number;
        normalDuration: number;
    };
    components: ComponentRecipes;
};
