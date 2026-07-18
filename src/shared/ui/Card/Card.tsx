import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/** Shared surface container. */
const cardStyles = tv({
    variants: {
        variant: {
            surface: "bg-white",
            muted: "bg-surface-muted",
        },
    },
    defaultVariants: {
        variant: "surface",
    },
});

type CardProps = PropsWithChildren<
    ViewProps &
        VariantProps<typeof cardStyles> & {
        className?: string;
    }
>;

export function Card({
    children,
    className,
    variant,
    ...props
}: CardProps) {
    return (
        <View
            {...props}
            className={cardStyles({ className, variant })}
        >
            {children}
        </View>
    );
}
