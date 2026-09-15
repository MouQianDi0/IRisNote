import { tv, type VariantProps } from "tailwind-variants";

/**
 * Button 的集中样式配方。
 *
 * 这里只组合 global.css 中已经存在的语义 Token；颜色值本身仍由
 * global.css 维护，避免组件样式与全局设计变量形成两个数据源。
 */
export const buttonStyles = tv({
    variants: {
        /** 按钮的业务语义外观，不包含是否可点击的交互判断。 */
        variant: {
            primary: "bg-primary",
            secondary: "bg-gray-100",
            danger: "bg-red-500",
        },
        /**
         * 与 Button 接收到的原生 disabled 属性保持同步。
         * 调用方不需要再额外传入 variant="disabled"。
         */
        disabled: {
            true: "bg-gray-300",
            false: "",
        },
    },
    defaultVariants: {
        variant: "primary",
        disabled: false,
    },
});

/**
 * 从样式配方自动推导 variant 等属性类型，新增变体时无需再维护一份
 * 独立的字符串联合类型。
 */
export type ButtonStyleVariants = VariantProps<typeof buttonStyles>;
