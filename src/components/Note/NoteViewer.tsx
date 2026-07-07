import { ArrowLeft } from "lucide-react-native";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

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

const formatCreatedAt = (createdAt: string) => {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export default function NoteViewer({ note, onBack }: NoteViewerProps) {
  return (
    <View className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-[#eee] px-[15px] pb-[15px]">
        <TouchableOpacity onPress={onBack} className="p-[10px]">
          <ArrowLeft size={24} color="#000" />
        </TouchableOpacity>

        <Text
          className="max-w-[70%] text-center text-lg font-bold text-gray-900"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          查看笔记
        </Text>

        <View className="w-11" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <Text selectable className="text-2xl font-bold text-gray-900">
          {note.title}
        </Text>

        <View className="mt-3 flex-row flex-wrap items-center gap-2">
          <View className="rounded-full bg-blue-50 px-3 py-1">
            <Text className="text-xs text-blue-500">
              {note.category_id == null
                ? "默认分类"
                : `分类 ${note.category_id}`}
            </Text>
          </View>
          <Text className="text-xs text-gray-400">
            {formatCreatedAt(note.created_at)}
          </Text>
        </View>

        <Text selectable className="mt-6 text-base leading-7 text-gray-700">
          {note.content?.trim() || "暂无内容"}
        </Text>
      </ScrollView>
    </View>
  );
}
