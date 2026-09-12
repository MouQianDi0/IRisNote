import { colors } from "@/shared/theme";
import {
    ActivityIndicator,
    Pressable,
    Text,
    type PressableProps,
} from "react-native";
import { tv } from "tailwind-variants";

const buttonStyles = tv({
    base: "h-12 flex-row items-center justify-center gap-2 rounded-hyper-control px-3 active:opacity-85",
    variants: {
        variant: { primary: "bg-primary", tonal: "bg-hyper-card" },
        disabled: { true: "", false: "" },
    },
    compoundVariants: [
        {
            variant: "primary",
            disabled: true,
            class: "bg-hyper-primary-disabled",
        },
        {
            variant: "tonal",
            disabled: true,
            class: "bg-hyper-secondary-disabled",
        },
    ],
});

type AuthButtonProps = PressableProps & {
    label: string;
    busy?: boolean;
    variant?: "primary" | "tonal";
    className?: string;
};

export function AuthButton({
    label,
    busy = false,
    disabled = false,
    variant = "primary",
    className,
    ...props
}: AuthButtonProps) {
    const unavailable = disabled || busy;
    const textClass =
        variant === "primary"
            ? "text-white"
            : unavailable
              ? "text-hyper-primary-faded"
              : "text-primary";
    return (
        <Pressable
            {...props}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: unavailable, busy }}
            disabled={unavailable}
            className={buttonStyles({
                variant,
                disabled: unavailable,
                class: className,
            })}
        >
            {busy && (
                <ActivityIndicator
                    size="small"
                    color={
                        variant === "primary" ? colors.surface : colors.primary
                    }
                />
            )}
            <Text
                className={`shrink text-[17px] ${textClass}`}
                numberOfLines={1}
            >
                {label}
            </Text>
        </Pressable>
    );
}
