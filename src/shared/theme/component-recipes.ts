import { semanticColors as color } from "./semantic-colors";
import type { ComponentRecipes } from "./theme.types";

export const componentRecipes = {
    button: {
        primary: {
            default: {
                background: color.brandPrimary,
                content: color.onBrandPrimary,
            },
            disabled: {
                background: color.primaryDisabled,
                content: color.onPrimaryDisabled,
            },
        },
        secondary: {
            default: {
                background: color.surfaceControl,
                content: color.textPrimary,
            },
            disabled: {
                background: color.secondaryDisabled,
                content: color.textDisabled,
            },
        },
        tonal: {
            default: {
                background: color.surfaceControl,
                content: color.brandPrimary,
            },
            disabled: {
                background: color.secondaryDisabled,
                content: color.primaryFaded,
            },
        },
        danger: {
            default: {
                background: color.destructive,
                content: color.onDestructive,
            },
            disabled: {
                background: color.destructiveDisabled,
                content: color.onDestructiveDisabled,
            },
        },
        text: {
            default: {
                background: color.transparent,
                content: color.brandPrimary,
            },
            disabled: {
                background: color.transparent,
                content: color.primaryFaded,
            },
        },
    },
    iconButton: {
        ghost: {
            default: {
                background: color.transparent,
                content: color.textPrimary,
            },
            disabled: {
                background: color.transparent,
                content: color.textDisabled,
            },
        },
        tonal: {
            default: {
                background: color.surfaceControl,
                content: color.textPrimary,
            },
            disabled: {
                background: color.secondaryDisabled,
                content: color.textDisabled,
            },
        },
        selected: {
            default: {
                background: color.surfaceSelected,
                content: color.brandPrimary,
            },
            disabled: {
                background: color.secondaryDisabled,
                content: color.textDisabled,
            },
        },
    },
    input: {
        default: {
            background: color.surfaceControl,
            content: color.textPrimary,
            border: color.transparent,
        },
        focused: {
            background: color.surfaceControl,
            content: color.textPrimary,
            border: color.borderFocused,
        },
        invalid: {
            background: color.surfaceControl,
            content: color.textPrimary,
            border: color.destructive,
        },
        disabled: {
            background: color.secondaryDisabled,
            content: color.textDisabled,
            border: color.transparent,
        },
        readOnly: {
            background: color.secondaryDisabled,
            content: color.textPrimary,
            border: color.transparent,
        },
    },
    inlineHint: {
        neutral: {
            background: color.transparent,
            content: color.textSecondary,
        },
        important: {
            background: color.transparent,
            content: color.destructive,
        },
    },
    iconPickerCell: {
        default: {
            background: color.surfaceControl,
            content: color.textSecondary,
            border: color.transparent,
        },
        selected: {
            background: color.surfaceSelected,
            content: color.brandPrimary,
            border: color.borderSelected,
        },
        disabled: {
            background: color.secondaryDisabled,
            content: color.textDisabled,
            border: color.transparent,
        },
    },
    progressBubble: {
        background: color.surface,
        content: color.textPrimary,
        border: color.divider,
    },
} as const satisfies ComponentRecipes;
