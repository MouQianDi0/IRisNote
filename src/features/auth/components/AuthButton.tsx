import { AppButton, type AppButtonProps } from "@/shared/ui";

type AuthButtonProps = Omit<AppButtonProps, "loading" | "variant"> & {
    busy?: boolean;
    variant?: "primary" | "tonal";
};

export function AuthButton({
    label,
    busy = false,
    disabled = false,
    variant = "primary",
    className,
    ...props
}: AuthButtonProps) {
    return (
        <AppButton
            {...props}
            label={label}
            loading={busy}
            disabled={disabled}
            variant={variant}
            className={className}
        />
    );
}
