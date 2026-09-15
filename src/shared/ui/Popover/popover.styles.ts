import { tv } from "tailwind-variants";

/** 气泡的视觉外观只属于共享组件，锚点定位仍由原生 style 负责。 */
export const popoverPanelStyles = tv({
    base: "overflow-hidden border border-border-soft bg-white",
    variants: {
        density: {
            compact: "rounded-control",
            comfortable: "rounded-modal",
        },
    },
    defaultVariants: {
        density: "comfortable",
    },
});
