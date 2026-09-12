import { useAuth } from "@/features/auth/hooks/useAuth";
import { Text, View } from "react-native";
import type { Note } from "../../notes.types";
import NewNoteEditor from "./new-note-editor";

type NoteEditorProps = {
  draftKey?: string;
  autoFocusContent?: boolean;
  categoryId?: number | null;
  categoryName?: string;
  onCancel: () => void;
  onSaved: (note: Note) => void;
};

/** 新建笔记入口；既有笔记统一由详情页内的 NoteViewer 处理。 */
export default function NoteEditor(props: NoteEditorProps) {
  const { user } = useAuth();

  if (!user) {
    return (
      <View className="flex-1 bg-white p-5">
        <Text>请登录后编辑笔记</Text>
      </View>
    );
  }

  return (
    <NewNoteEditor
      key={`${user.id}:${props.draftKey ?? "new"}`}
      {...props}
      owner={user.id}
    />
  );
}
