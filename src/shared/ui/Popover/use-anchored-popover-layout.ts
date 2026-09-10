import { radius, spacing } from "@/shared/theme";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    useWindowDimensions,
    View,
    type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type AnchorLayout = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type PopoverPlacement = "top" | "bottom";

export type PopoverPosition = {
    placement: PopoverPlacement;
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    arrowLeft: number;
};

type UseAnchoredPopoverLayoutOptions = {
    anchorRef: RefObject<View | null>;
    width: number;
    maxHeight: number;
    measurementEnabled: boolean;
};

const SCREEN_MARGIN = spacing.lg;
const ANCHOR_GAP = spacing.md;
export const POPOVER_ARROW_SIZE = spacing.sm;
const MIN_POPOVER_HEIGHT = 160;

const clamp = (value: number, minimum: number, maximum: number) =>
    Math.min(Math.max(value, minimum), maximum);

export function useAnchoredPopoverLayout({
    anchorRef,
    width,
    maxHeight,
    measurementEnabled,
}: UseAnchoredPopoverLayoutOptions) {
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [anchorLayout, setAnchorLayout] = useState<AnchorLayout | null>(null);
    const [contentHeight, setContentHeight] = useState(0);
    const measurementSessionRef = useRef(0);
    const measureRequestRef = useRef(0);
    const measureFrameRef = useRef<number | null>(null);
    const windowSizeRef = useRef({ width: windowWidth, height: windowHeight });

    const measureAnchor = useCallback(() => {
        if (measureFrameRef.current !== null) {
            cancelAnimationFrame(measureFrameRef.current);
        }

        const session = measurementSessionRef.current;
        const request = ++measureRequestRef.current;

        measureFrameRef.current = requestAnimationFrame(() => {
            measureFrameRef.current = null;
            anchorRef.current?.measureInWindow(
                (x, y, anchorWidth, anchorHeight) => {
                    if (
                        session !== measurementSessionRef.current ||
                        request !== measureRequestRef.current
                    ) {
                        return;
                    }

                    setAnchorLayout({
                        x,
                        y,
                        width: anchorWidth,
                        height: anchorHeight,
                    });
                },
            );
        });
    }, [anchorRef]);

    const beginMeasurement = useCallback(() => {
        measurementSessionRef.current += 1;
        measureRequestRef.current += 1;

        if (measureFrameRef.current !== null) {
            cancelAnimationFrame(measureFrameRef.current);
            measureFrameRef.current = null;
        }

        setAnchorLayout(null);
        setContentHeight(0);
        measureAnchor();
    }, [measureAnchor]);

    const resetLayout = useCallback(() => {
        measurementSessionRef.current += 1;
        measureRequestRef.current += 1;

        if (measureFrameRef.current !== null) {
            cancelAnimationFrame(measureFrameRef.current);
            measureFrameRef.current = null;
        }

        setAnchorLayout(null);
        setContentHeight(0);
    }, []);

    useEffect(() => {
        const previousSize = windowSizeRef.current;
        const sizeChanged =
            previousSize.width !== windowWidth ||
            previousSize.height !== windowHeight;

        windowSizeRef.current = { width: windowWidth, height: windowHeight };

        if (!measurementEnabled || !sizeChanged) return;

        measureAnchor();
    }, [measureAnchor, measurementEnabled, windowHeight, windowWidth]);

    useEffect(
        () => () => {
            measurementSessionRef.current += 1;
            measureRequestRef.current += 1;

            if (measureFrameRef.current !== null) {
                cancelAnimationFrame(measureFrameRef.current);
            }
        },
        [],
    );

    const position = useMemo<PopoverPosition | null>(() => {
        if (!anchorLayout) return null;

        const topBoundary = insets.top + SCREEN_MARGIN;
        const bottomBoundary = windowHeight - insets.bottom - SCREEN_MARGIN;
        const availableWidth = Math.max(0, windowWidth - SCREEN_MARGIN * 2);
        const resolvedWidth = Math.min(width, availableWidth);
        const anchorCenterX = anchorLayout.x + anchorLayout.width / 2;
        const left = clamp(
            anchorCenterX - resolvedWidth / 2,
            SCREEN_MARGIN,
            Math.max(SCREEN_MARGIN, windowWidth - SCREEN_MARGIN - resolvedWidth),
        );
        const spaceAbove = anchorLayout.y - ANCHOR_GAP - topBoundary;
        const spaceBelow =
            bottomBoundary -
            (anchorLayout.y + anchorLayout.height + ANCHOR_GAP);
        const placement: PopoverPlacement =
            spaceBelow >= Math.min(MIN_POPOVER_HEIGHT, maxHeight) ||
            spaceBelow >= spaceAbove
                ? "bottom"
                : "top";
        const availableHeight =
            placement === "bottom" ? spaceBelow : spaceAbove;
        const resolvedMaxHeight = Math.max(
            0,
            Math.min(maxHeight, availableHeight),
        );
        const measuredHeight = Math.min(
            contentHeight || resolvedMaxHeight,
            resolvedMaxHeight,
        );
        const top =
            placement === "bottom"
                ? anchorLayout.y + anchorLayout.height + ANCHOR_GAP
                : anchorLayout.y - ANCHOR_GAP - measuredHeight;
        const arrowLeft = clamp(
            anchorCenterX - left - POPOVER_ARROW_SIZE,
            radius.control,
            resolvedWidth - radius.control - POPOVER_ARROW_SIZE * 2,
        );

        return {
            placement,
            left,
            top,
            width: resolvedWidth,
            maxHeight: resolvedMaxHeight,
            arrowLeft,
        };
    }, [
        anchorLayout,
        contentHeight,
        insets.bottom,
        insets.top,
        maxHeight,
        width,
        windowHeight,
        windowWidth,
    ]);

    const handleContentLayout = useCallback((event: LayoutChangeEvent) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setContentHeight((currentHeight) =>
            currentHeight === nextHeight ? currentHeight : nextHeight,
        );
    }, []);

    return {
        position,
        hasMeasuredLayout: position !== null && contentHeight > 0,
        handleContentLayout,
        beginMeasurement,
        resetLayout,
    };
}
