import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * 顶层页面容器配方。
 *
 * plain 只建立全屏布局，surface 增加白色背景，centeredMuted 用于居中的
 * 空状态或占位页面；页面独有的间距和布局继续通过 className 扩展。
 */
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

/** VariantProps 让 Screen 的可用变体由样式配方直接驱动。 */
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
            className={screenStyles({
                variant,
                class: className,
            })}
        >
            {children}
        </View>
    );
}
