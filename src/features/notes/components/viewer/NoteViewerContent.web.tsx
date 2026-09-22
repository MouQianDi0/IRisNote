import { useEffect, useRef, useCallback, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { colors } from "@/shared/theme";
import { normalizeReadingText } from "../../reading/reading-position";
import { measureReadingText } from "../../reading/measure-reading-text.web";
import type { NoteViewerContentProps } from "./reading-content.types";

export default function NoteViewerContent({
    content,
    inputRef,
    editable,
    showSoftInputOnFocus,
    onChangeText,
    onPressIn,
    onFocus,
    onBlur,
    onSelectionChange,
    onBodyLayout,
    onRows,
}: NoteViewerContentProps) {
    const text = normalizeReadingText(content);
    const element = useRef<Text>(null);
    const [inputHeight, setInputHeight] = useState(28);
    const measure = useCallback(() => {
        const target = element.current as unknown as HTMLElement | null;
        if (target) {
            onRows(measureReadingText(target, text));
            const height = Math.max(
                28,
                Math.ceil(target.getBoundingClientRect().height),
            );
            setInputHeight((current) =>
                current === height ? current : height,
            );
        }
    }, [text, onRows]);
    useEffect(() => {
        const target = element.current as unknown as HTMLElement | null;
        if (!target) return;
        let frame = 0;
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(schedule);
        observer.observe(target);
        schedule();
        document.fonts?.addEventListener("loadingdone", schedule);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            document.fonts?.removeEventListener("loadingdone", schedule);
        };
    }, [measure]);
    return (
        <View
            className="mt-6"
            onLayout={(e) =>
                onBodyLayout(
                    e.nativeEvent.layout.y,
                    e.nativeEvent.layout.height,
                )
            }
        >
            <Text
                ref={element}
                pointerEvents="none"
                style={{ position: "absolute", left: 0, right: 0, opacity: 0 }}
                className="text-base leading-7 text-gray-700"
            >
                {text || " "}
            </Text>
            <TextInput
                ref={inputRef}
                value={content}
                editable={editable}
                multiline
                scrollEnabled={false}
                showSoftInputOnFocus={showSoftInputOnFocus}
                selectionColor={colors.primary}
                placeholder="暂无内容"
                accessibilityLabel="笔记正文"
                onChangeText={onChangeText}
                onPressIn={onPressIn}
                onFocus={onFocus}
                onBlur={onBlur}
                onSelectionChange={onSelectionChange}
                onContentSizeChange={(event) => {
                    const height = Math.max(
                        28,
                        Math.ceil(event.nativeEvent.contentSize.height),
                    );
                    setInputHeight((current) =>
                        current === height ? current : height,
                    );
                }}
                className="text-base leading-7 text-gray-700"
                style={{ minHeight: inputHeight, padding: 0 }}
            />
        </View>
    );
}
