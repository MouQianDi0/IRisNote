import { colors } from "@/shared/theme";
import type { PropsWithChildren } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { popoverPanelStyles } from "./popover.styles";
import {
    POPOVER_ARROW_SIZE,
    type PopoverPosition,
} from "./use-anchored-popover-layout";

type PopoverSurfaceProps = PropsWithChildren<{
    position: PopoverPosition;
    onLayout: (event: LayoutChangeEvent) => void;
}>;

export function PopoverSurface({
    position,
    onLayout,
    children,
}: PopoverSurfaceProps) {
    return (
        <>
            <View
                onLayout={onLayout}
                className={popoverPanelStyles()}
                style={{
                    maxHeight: position.maxHeight,
                    borderCurve: "continuous",
                    boxShadow: `0 8px 24px ${colors.shadow}`,
                }}
            >
                {children}
            </View>

            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    left: position.arrowLeft,
                    ...(position.placement === "bottom"
                        ? { top: -POPOVER_ARROW_SIZE }
                        : { bottom: -POPOVER_ARROW_SIZE }),
                    width: 0,
                    height: 0,
                    borderLeftWidth: POPOVER_ARROW_SIZE,
                    borderRightWidth: POPOVER_ARROW_SIZE,
                    borderLeftColor: colors.transparent,
                    borderRightColor: colors.transparent,
                    ...(position.placement === "bottom"
                        ? {
                              borderBottomWidth: POPOVER_ARROW_SIZE,
                              borderBottomColor: colors.surface,
                          }
                        : {
                              borderTopWidth: POPOVER_ARROW_SIZE,
                              borderTopColor: colors.surface,
                          }),
                }}
            />
        </>
    );
}
