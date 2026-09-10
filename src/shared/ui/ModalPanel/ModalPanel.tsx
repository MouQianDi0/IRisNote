import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * 共享弹窗面板配方。
 *
 * 三个变体分别描述创建、操作菜单和确认弹窗的固定宽度与圆角。
 * rounded-modal 等自定义语义圆角不保证被 tailwind-merge 判定为同组，
 * 因此圆角差异集中在 variant 中切换，不依赖调用方传入冲突类名。
 */
const modalPanelStyles = tv({
    base: "bg-white p-5",
    variants: {
        variant: {
            create: "w-[320px] rounded-modal shadow-lg",
            actions: "w-[300px] rounded-control shadow-md",
            confirm: "w-[280px] rounded-card shadow-md",
        },
    },
});

/**
 * VariantProps 推导出的单个变体值可能包含 null 或 undefined；这里移除
 * 空值并在 ModalPanelProps 中保持 variant 必填，避免弹窗尺寸不明确。
 */
type ModalPanelVariant = NonNullable<
    VariantProps<typeof modalPanelStyles>["variant"]
>;

type ModalPanelProps = PropsWithChildren<
    ViewProps & {
        className?: string;
        variant: ModalPanelVariant;
    }
>;

export function ModalPanel({
    children,
    className = "",
    variant,
    ...props
}: ModalPanelProps) {
    return (
        <View
            {...props}
            className={modalPanelStyles({
                variant,
                class: className,
            })}
        >
            {children}
        </View>
    );
}
