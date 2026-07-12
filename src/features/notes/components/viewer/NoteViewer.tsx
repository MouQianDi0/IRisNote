import NoteViewerContent from "./NoteViewerContent";
import NoteViewerHeader from "./NoteViewerHeader";
import NoteViewerMeta from "./NoteViewerMeta";
import NoteViewerTitle from "./NoteViewerTitle";
import type { Note } from "@/features/notes/notes.types";
import { ScrollView, View } from "react-native";

type NoteViewerProps = {
  note: Note;
  onBack: () => void;
};

export default function NoteViewer({ note, onBack }: NoteViewerProps) {
  return (
    <View className="flex-1 bg-white">
      <NoteViewerHeader onBack={onBack} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <NoteViewerTitle
          title={note.title}
          renderMeta={(titleControls) => (
            <NoteViewerMeta
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
    </View>
  );
}
