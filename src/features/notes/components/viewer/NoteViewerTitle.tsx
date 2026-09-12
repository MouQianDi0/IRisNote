import { colors } from "@/shared/theme";
import { useState, type ReactNode, type RefObject } from "react";
import {
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputProps,
} from "react-native";

export type NoteViewerTitleControls = {
  isTitleExpandable: boolean;
  chevronAnimatedStyle: { transform: { rotate: string }[] };
  onToggleTitleExpanded: () => void;
};

type NoteViewerTitleProps = {
  title: string;
  inputRef: RefObject<TextInput | null>;
  editable: boolean;
  showSoftInputOnFocus: boolean;
  onChangeText: (value: string) => void;
  onPressIn: NonNullable<TextInputProps["onPressIn"]>;
  onFocus: NonNullable<TextInputProps["onFocus"]>;
  onBlur: NonNullable<TextInputProps["onBlur"]>;
  onSelectionChange: NonNullable<TextInputProps["onSelectionChange"]>;
  renderMeta: (controls: NoteViewerTitleControls) => ReactNode;
};

const TITLE_HEIGHT_EPSILON = 1;

export default function NoteViewerTitle({
  title,
  inputRef,
  editable,
  showSoftInputOnFocus,
  onChangeText,
  onPressIn,
  onFocus,
  onBlur,
  onSelectionChange,
  renderMeta,
}: NoteViewerTitleProps) {
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [collapsedTitleHeight, setCollapsedTitleHeight] = useState(0);
  const [expandedTitleHeight, setExpandedTitleHeight] = useState(0);
  const isTitleExpandable = expandedTitleHeight > collapsedTitleHeight + TITLE_HEIGHT_EPSILON;
  const visibleHeight = isTitleExpandable && !titleExpanded
    ? collapsedTitleHeight
    : expandedTitleHeight;

  const updateHeight = (
    event: LayoutChangeEvent,
    setter: (height: number) => void,
  ) => {
    const height = Math.ceil(event.nativeEvent.layout.height);
    if (height > 0) setter(height);
  };

  const toggleTitleExpanded = () => {
    if (isTitleExpandable) setTitleExpanded((expanded) => !expanded);
  };

  const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
    setTitleExpanded(true);
    onFocus(event);
  };

  const controls: NoteViewerTitleControls = {
    isTitleExpandable,
    chevronAnimatedStyle: {
      transform: [{ rotate: titleExpanded ? "180deg" : "0deg" }],
    },
    onToggleTitleExpanded: toggleTitleExpanded,
  };

  return (
    <>
      <View pointerEvents="none" className="absolute left-0 right-0 opacity-0">
        <Text
          className="text-2xl font-bold text-gray-900"
          numberOfLines={3}
          onLayout={(event) => updateHeight(event, setCollapsedTitleHeight)}
        >
          {title || " "}
        </Text>
        <Text
          className="text-2xl font-bold text-gray-900"
          onLayout={(event) => updateHeight(event, setExpandedTitleHeight)}
        >
          {title || " "}
        </Text>
      </View>

      <View style={visibleHeight > 0 ? { height: visibleHeight, overflow: "hidden" } : undefined}>
        <TextInput
          ref={inputRef}
          value={title}
          editable={editable}
          multiline
          scrollEnabled={false}
          showSoftInputOnFocus={showSoftInputOnFocus}
          selectionColor={colors.primary}
          underlineColorAndroid="transparent"
          accessibilityLabel="笔记标题"
          onChangeText={onChangeText}
          onPressIn={onPressIn}
          onFocus={handleFocus}
          onBlur={onBlur}
          onSelectionChange={onSelectionChange}
          className="text-2xl font-bold text-gray-900"
          style={{ height: visibleHeight || undefined, padding: 0 }}
        />
      </View>

      {renderMeta(controls)}
    </>
  );
}
