import type { PropsWithChildren, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { PopoverMotion } from "./popover-motion";
import { PopoverSurface } from "./popover-surface";
import { useAnchoredPopoverLayout } from "./use-anchored-popover-layout";

type PopoverPhase = "closed" | "measuring" | "presented" | "exiting";

export type AnchoredPopoverProps = PropsWithChildren<{
    visible: boolean;
    anchorRef: RefObject<View | null>;
    onClose: () => void;
    width?: number;
    maxHeight?: number;
    accessibilityLabel?: string;
}>;

/**
 * 通用锚点气泡只协调弹层生命周期，不感知业务菜单层级。
 * 位置测量、动画和面板渲染分别由内部模块负责。
 */
export function AnchoredPopover({
    visible,
    anchorRef,
    onClose,
    width = 300,
    maxHeight = 520,
    accessibilityLabel = "弹出菜单",
    children,
}: AnchoredPopoverProps) {
    const [phase, setPhase] = useState<PopoverPhase>(
        visible ? "measuring" : "closed",
    );
    const phaseRef = useRef<PopoverPhase>(phase);
    const lifecycleFrameRef = useRef<number | null>(null);
    const presentationFrameRef = useRef<number | null>(null);
    const {
        position,
        hasMeasuredLayout,
        handleContentLayout,
        beginMeasurement,
        resetLayout,
    } = useAnchoredPopoverLayout({
        anchorRef,
        width,
        maxHeight,
        measurementEnabled: visible,
    });

    useEffect(() => {
        if (lifecycleFrameRef.current !== null) {
            cancelAnimationFrame(lifecycleFrameRef.current);
            lifecycleFrameRef.current = null;
        }
        if (presentationFrameRef.current !== null) {
            cancelAnimationFrame(presentationFrameRef.current);
            presentationFrameRef.current = null;
        }

        lifecycleFrameRef.current = requestAnimationFrame(() => {
            lifecycleFrameRef.current = null;

            if (visible) {
                beginMeasurement();
                phaseRef.current = "measuring";
                setPhase("measuring");
                return;
            }

            if (phaseRef.current === "presented") {
                phaseRef.current = "exiting";
                setPhase("exiting");
                return;
            }

            phaseRef.current = "closed";
            setPhase("closed");
            resetLayout();
        });

        return () => {
            if (lifecycleFrameRef.current !== null) {
                cancelAnimationFrame(lifecycleFrameRef.current);
                lifecycleFrameRef.current = null;
            }
        };
    }, [beginMeasurement, resetLayout, visible]);

    useEffect(() => {
        if (!visible || phase !== "measuring" || !hasMeasuredLayout) return;

        presentationFrameRef.current = requestAnimationFrame(() => {
            presentationFrameRef.current = null;
            if (phaseRef.current !== "measuring") return;

            phaseRef.current = "presented";
            setPhase("presented");
        });

        return () => {
            if (presentationFrameRef.current !== null) {
                cancelAnimationFrame(presentationFrameRef.current);
                presentationFrameRef.current = null;
            }
        };
    }, [hasMeasuredLayout, phase, visible]);

    useEffect(
        () => () => {
            if (lifecycleFrameRef.current !== null) {
                cancelAnimationFrame(lifecycleFrameRef.current);
            }
            if (presentationFrameRef.current !== null) {
                cancelAnimationFrame(presentationFrameRef.current);
            }
        },
        [],
    );

    const handleMotionExited = useCallback(() => {
        if (phaseRef.current !== "exiting") return;

        phaseRef.current = "closed";
        setPhase("closed");
        resetLayout();
    }, [resetLayout]);

    return (
        <Modal
            visible={phase !== "closed"}
            transparent
            animationType="none"
            statusBarTranslucent
            navigationBarTranslucent
            presentationStyle="overFullScreen"
            onRequestClose={onClose}
        >
            <View
                className="flex-1"
                accessibilityViewIsModal
                collapsable={false}
            >
                <Pressable
                    accessibilityLabel="关闭弹出菜单"
                    className="absolute inset-0"
                    onPress={onClose}
                />

                {position && phase !== "closed" && (
                    <PopoverMotion
                        phase={phase}
                        position={position}
                        accessibilityLabel={accessibilityLabel}
                        onExited={handleMotionExited}
                    >
                        <PopoverSurface
                            position={position}
                            onLayout={handleContentLayout}
                        >
                            {children}
                        </PopoverSurface>
                    </PopoverMotion>
                )}
            </View>
        </Modal>
    );
}
