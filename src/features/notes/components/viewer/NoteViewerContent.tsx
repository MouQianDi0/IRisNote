import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { colors } from "@/shared/theme";
import {
  nativeTextRows,
  normalizeReadingText,
} from "../../reading/reading-position";
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
  const [inputHeight, setInputHeight] = useState(28);
  return (
    <View
      className="mt-6"
      onLayout={(e) =>
        onBodyLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
      }
    >
      <Text
        pointerEvents="none"
        style={{ position: "absolute", left: 0, right: 0, opacity: 0 }}
        className="text-base leading-7 text-gray-700"
        onTextLayout={(e) => onRows(nativeTextRows(text, e.nativeEvent.lines))}
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
        underlineColorAndroid="transparent"
        placeholder="暂无内容"
        accessibilityLabel="笔记正文"
        onChangeText={onChangeText}
        onPressIn={onPressIn}
        onFocus={onFocus}
        onBlur={onBlur}
        onSelectionChange={onSelectionChange}
        onContentSizeChange={(event) => {
          const height = Math.max(28, Math.ceil(event.nativeEvent.contentSize.height));
          setInputHeight((current) => current === height ? current : height);
        }}
        textAlignVertical="top"
        className="text-base leading-7 text-gray-700"
        style={{ minHeight: inputHeight, padding: 0 }}
      />
    </View>
  );
}
