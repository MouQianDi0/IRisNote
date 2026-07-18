import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";
import { tv, type VariantProps } from "tailwind-variants";

/** Shared modal content panel. */
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

type ModalPanelProps = PropsWithChildren<
    ViewProps &
        VariantProps<typeof modalPanelStyles> & {
        className?: string;
    } &
        Required<Pick<VariantProps<typeof modalPanelStyles>, "variant">>
>;

export function ModalPanel({
    children,
    className,
    variant,
    ...props
}: ModalPanelProps) {
    return (
        <View
            {...props}
            className={modalPanelStyles({ className, variant })}
        >
            {children}
        </View>
    );
}
