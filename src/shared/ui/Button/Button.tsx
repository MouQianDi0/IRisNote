import type { PropsWithChildren } from "react";
import { Pressable, type PressableProps } from "react-native";
import { buttonStyles, type ButtonStyleVariants } from "./button.styles";

/**
 * 共享按钮：原生 disabled 是交互状态与禁用外观的唯一来源。
 *
 * 从 PressableProps 和样式变体中排除 disabled 后重新声明，可以避免
 * 两套同名属性产生交叉类型，并确保组件只向 Pressable 传递一个结果。
 */
type ButtonProps = PropsWithChildren<
    Omit<PressableProps, "disabled"> &
    Omit<ButtonStyleVariants, "disabled"> & {
        className?: string;
        disabled?: boolean;
    }
>;

export function Button({
    children,
    className,
    variant,
    disabled = false,
    ...props
}: ButtonProps) {
    // class 让调用方保留局部扩展能力，标准 Tailwind 冲突由
    // tailwind-merge 处理；自定义语义 Token 应优先通过 variant 切换。
    return (
        <Pressable
            {...props}
            disabled={disabled}
            className={buttonStyles({
                variant,
                disabled,
                class: className,
            })}
        >
            {children}
        </Pressable>
    );
}
