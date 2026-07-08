import NoteViewerContent from "@/components/Note/Viewer/NoteViewerContent";
import NoteViewerHeader from "@/components/Note/Viewer/NoteViewerHeader";
import NoteViewerMeta from "@/components/Note/Viewer/NoteViewerMeta";
import NoteViewerTitle from "@/components/Note/Viewer/NoteViewerTitle";
import { ScrollView, View } from "react-native";

export type NoteViewerNote = {
  id: number;
  title: string;
  content: string | null;
  category_id: number | null;
  created_at: string;
  is_pinned?: boolean;
  is_starred?: boolean;
  local_order?: number;
  pinned_order?: number;
};

type NoteViewerProps = {
  note: NoteViewerNote;
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
