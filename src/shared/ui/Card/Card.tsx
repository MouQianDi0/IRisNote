import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * 共享卡片表面配方。
 * surface 用于普通白色内容容器，muted 用于需要弱化层级的次级表面。
 */
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

/** VariantProps 使 Card 的公开变体类型始终与上方配方保持一致。 */
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
            className={cardStyles({
                variant,
                class: className,
            })}
        >
            {children}
        </View>
    );
}
