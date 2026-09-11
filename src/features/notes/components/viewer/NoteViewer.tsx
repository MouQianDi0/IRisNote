import { saveReadingProgress } from "../../data/note-reading-progress";
import NoteViewerContent from "./NoteViewerContent";
import NoteViewerHeader from "./NoteViewerHeader";
import NoteViewerMeta from "./NoteViewerMeta";
import NoteViewerTitle from "./NoteViewerTitle";
import type { Note } from "@/features/notes/notes.types";
import { ScrollView, View } from "react-native";
import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import EditorBottomToolbar, { FLOATING_BOTTOM, FLOATING_TOUCH_HEIGHT } from "@/core/editor/components/editor-bottom-toolbar";
import { advanceToolbarScroll, resetToolbarScroll } from "@/core/editor/toolbar-interaction";

type NoteViewerProps = {
  note: Note;
  onBack: () => void;
  onEdit: () => void;
};

export default function NoteViewer({ note, onBack, onEdit }: NoteViewerProps) {
  const readingPercent = useRef(0);
  useFocusEffect(useCallback(() => {
    readingPercent.current = 0;
    return () => {
      if (note.user_id != null) void saveReadingProgress(note.user_id, note.id, readingPercent.current);
    };
  }, [note.id, note.user_id]));
  const scroll = useRef(resetToolbarScroll());
  const visible = useSharedValue(true);
  useFocusEffect(useCallback(() => {
    scroll.current = resetToolbarScroll(scroll.current.offset);
    visible.set(true);
  }, [visible]));
  const toolbarStyle = useAnimatedStyle(() => ({ display: visible.get() ? "flex" : "none" }));
  return (
    <View className="flex-1 bg-white">
      <NoteViewerHeader onBack={onBack} onEdit={onEdit} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: FLOATING_TOUCH_HEIGHT + FLOATING_BOTTOM + 12 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distance = contentSize.height - layoutMeasurement.height;
          readingPercent.current = distance > 0 ? Math.max(0, Math.min(100, contentOffset.y / distance * 100)) : 100;
          const offset = Math.min(contentOffset.y, Math.max(0, contentSize.height - layoutMeasurement.height));
          const next = advanceToolbarScroll(scroll.current, offset, false);
          if (next.visible !== scroll.current.visible) visible.set(next.visible);
          scroll.current = next;
        }}
      >
        <NoteViewerTitle
          title={note.title}
          renderMeta={(titleControls) => (
            <NoteViewerMeta
              noteId={note.id}
              content={note.content}
              categoryId={note.category_id}
              createdAt={note.created_at}
              isTitleExpandable={titleControls.isTitleExpandable}
              chevronAnimatedStyle={titleControls.chevronAnimatedStyle}
              onToggleTitleExpanded={titleControls.onToggleTitleExpanded}
            />
          )}
        />
        <NoteViewerContent content={note.content} />
      </ScrollView>
      <Animated.View pointerEvents="box-none" style={[{ position: "absolute", bottom: FLOATING_BOTTOM, alignSelf: "center" }, toolbarStyle]}>
        <EditorBottomToolbar docked={false} disabled={false} onEdit={onEdit} />
      </Animated.View>
    </View>
  );
}
