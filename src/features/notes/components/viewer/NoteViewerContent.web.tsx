import { useEffect, useRef, useCallback } from "react";
import { Text, View } from "react-native";
import { normalizeReadingText } from "../../reading/reading-position";
import { measureReadingText } from "../../reading/measure-reading-text.web";
import type { NoteViewerContentProps } from "./reading-content.types";

export default function NoteViewerContent({
  content,
  onBodyLayout,
  onRows,
}: NoteViewerContentProps) {
  const text = normalizeReadingText(content);
  const element = useRef<Text>(null);
  const measure = useCallback(() => {
    const target = element.current as unknown as HTMLElement | null;
    if (target) onRows(measureReadingText(target, text));
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
        onBodyLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
      }
    >
      <Text
        ref={element}
        selectable
        className="text-base leading-7 text-gray-700"
      >
        {text || "暂无内容"}
      </Text>
    </View>
  );
}
