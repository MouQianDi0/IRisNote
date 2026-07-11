import type { PropsWithChildren } from "react";
import { Pressable, type PressableProps } from "react-native";

/** Shared pressable button with semantic visual variants. */
type ButtonVariant = "primary" | "disabled" | "secondary" | "danger";

type ButtonProps = PropsWithChildren<
    PressableProps & {
        className?: string;
        variant?: ButtonVariant;
    }
>;

const variantClassNames: Record<ButtonVariant, string> = {
    primary: "bg-primary",
    disabled: "bg-gray-300",
    secondary: "bg-gray-100",
    danger: "bg-red-500",
};

export function Button({
    children,
    className = "",
    variant = "primary",
    ...props
}: ButtonProps) {
    return (
        <Pressable
            {...props}
            className={`${className} ${variantClassNames[variant]}`.trim()}
        >
            {children}
        </Pressable>
    );
}
