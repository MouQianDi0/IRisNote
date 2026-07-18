import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/** Shared top-level screen container. */
const screenStyles = tv({
    variants: {
        variant: {
            plain: "flex-1",
            surface: "flex-1 bg-white",
            centeredMuted:
                "flex-1 items-center justify-center bg-surface-muted",
        },
    },
    defaultVariants: {
        variant: "plain",
    },
});

type ScreenProps = PropsWithChildren<
    ViewProps &
        VariantProps<typeof screenStyles> & {
        className?: string;
    }
>;

export function Screen({
    children,
    className,
    variant,
    ...props
}: ScreenProps) {
    return (
        <View
            {...props}
            className={screenStyles({ className, variant })}
        >
            {children}
        </View>
    );
}
