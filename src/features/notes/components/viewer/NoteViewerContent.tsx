import { Text, View } from "react-native";
import {
  nativeTextRows,
  normalizeReadingText,
} from "../../reading/reading-position";
import type { NoteViewerContentProps } from "./reading-content.types";

export default function NoteViewerContent({
  content,
  onBodyLayout,
  onRows,
}: NoteViewerContentProps) {
  const text = normalizeReadingText(content);
  return (
    <View
      className="mt-6"
      onLayout={(e) =>
        onBodyLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
      }
    >
      <Text
        selectable
        className="text-base leading-7 text-gray-700"
        onTextLayout={(e) => onRows(nativeTextRows(text, e.nativeEvent.lines))}
      >
        {text || "暂无内容"}
      </Text>
    </View>
  );
}
