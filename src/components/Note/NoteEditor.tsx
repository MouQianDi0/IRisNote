import api from "@/api/client";
import {
  notifyNotesChanged,
  setCachedNote,
  type CachedNote,
} from "@/data/notes";
import { ArrowLeft, Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type NoteEditorProps = {
  note: CachedNote;
  onCancel: () => void;
  onSaved: (note: CachedNote) => void;
};

export default function NoteEditor({
  note,
  onCancel,
  onSaved,
}: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content ?? "");
  }, [note]);

  const handleSave = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      Alert.alert("提示", "请输入笔记标题");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.put<CachedNote>(`/notes/${note.id}`, {
        title: nextTitle,
        content: content.trim(),
        category_id: note.category_id,
      });
      const updatedNote = { ...note, ...data };
      setCachedNote(updatedNote);
      notifyNotesChanged();
      onSaved(updatedNote);
    } catch (err: any) {
      Alert.alert("提示", err.response?.data?.error || "保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-gray-200 px-4 pb-3 pt-3">
        <Pressable onPress={onCancel} className="p-2">
          <ArrowLeft size={24} color="#111827" />
        </Pressable>
        <Text className="text-[18px] font-semibold text-gray-800">
          编辑笔记
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="p-2"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Check size={24} color="#007AFF" />
          )}
        </Pressable>
      </View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="输入标题..."
        className="border-b border-gray-200 px-5 py-4 text-[22px] font-semibold text-gray-900"
      />
      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder="输入笔记内容..."
        multiline
        textAlignVertical="top"
        className="flex-1 px-5 py-4 text-[16px] text-gray-700"
      />
    </View>
  );
}
