import type { PropsWithChildren } from "react";
import { Pressable, type PressableProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/** Shared pressable button with semantic visual variants. */
const buttonStyles = tv({
    variants: {
        variant: {
            primary: "bg-primary",
            secondary: "bg-gray-100",
            danger: "bg-red-500",
        },
        disabled: {
            true: "bg-gray-300",
        },
    },
    defaultVariants: {
        variant: "primary",
        disabled: false,
    },
});

type ButtonProps = PropsWithChildren<
    PressableProps &
        VariantProps<typeof buttonStyles> & {
        className?: string;
    }
>;

export function Button({
    children,
    className,
    disabled,
    variant,
    ...props
}: ButtonProps) {
    return (
        <Pressable
            {...props}
            disabled={disabled}
            className={buttonStyles({ className, disabled, variant })}
        >
            {children}
        </Pressable>
    );
}
