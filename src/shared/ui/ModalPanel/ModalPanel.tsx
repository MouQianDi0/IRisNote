import type { PropsWithChildren } from "react";
import { View, type ViewProps } from "react-native";

/** Shared modal content panel. */
type ModalPanelVariant = "create" | "actions" | "confirm";

type ModalPanelProps = PropsWithChildren<
    ViewProps & {
        className?: string;
        variant: ModalPanelVariant;
    }
>;

const variantClassNames: Record<ModalPanelVariant, string> = {
    create: "w-[320px] rounded-modal shadow-lg",
    actions: "w-[300px] rounded-control shadow-md",
    confirm: "w-[280px] rounded-card shadow-md",
};

export function ModalPanel({
    children,
    className = "",
    variant,
    ...props
}: ModalPanelProps) {
    return (
        <View
            {...props}
            className={`bg-white p-5 ${variantClassNames[variant]} ${className}`.trim()}
        >
            {children}
        </View>
    );
}
