import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";

type ScreenVariant = "plain" | "surface" | "centeredMuted";

type ScreenProps = PropsWithChildren<
    ViewProps & {
        className?: string;
        variant?: ScreenVariant;
    }
>;

const variantClassNames: Record<ScreenVariant, string> = {
    plain: "flex-1",
    surface: "flex-1 bg-white",
    centeredMuted: "flex-1 items-center justify-center bg-surface-muted",
};

export function Screen({
    children,
    className = "",
    variant = "plain",
    ...props
}: ScreenProps) {
    return (
        <View
            {...props}
            className={`${variantClassNames[variant]} ${className}`.trim()}
        >
            {children}
        </View>
    );
}
