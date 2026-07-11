import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";

type CardVariant = "surface" | "muted";

type CardProps = PropsWithChildren<
    ViewProps & {
        className?: string;
        variant?: CardVariant;
    }
>;

const variantClassNames: Record<CardVariant, string> = {
    surface: "bg-white",
    muted: "bg-surface-muted",
};

export function Card({
    children,
    className = "",
    variant = "surface",
    ...props
}: CardProps) {
    return (
        <View
            {...props}
            className={`${className} ${variantClassNames[variant]}`.trim()}
        >
            {children}
        </View>
    );
}
