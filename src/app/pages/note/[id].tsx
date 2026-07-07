import api from "@/api/client";
import NoteViewer, { type NoteViewerNote } from "@/components/Note/NoteViewer";
import { getCachedNoteById, setCachedNotes } from "@/data/notes";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

type Note = NoteViewerNote;

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function NoteDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const [note, setNote] = useState<Note | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const numericNoteId = useMemo(() => {
    const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
    const parsedId = Number(rawId);

    if (!rawId || !Number.isInteger(parsedId) || parsedId <= 0) {
      return null;
    }

    return parsedId;
  }, [params.id]);

  const fetchNote = useCallback(async () => {
    if (numericNoteId == null) {
      setNote(null);
      setLoadState("not-found");
      return;
    }

    const cachedNote = getCachedNoteById(numericNoteId);
    if (cachedNote) {
      setNote(cachedNote);
      setLoadState("ready");
      return;
    }

    setLoadState("loading");
    setErrorMessage("");

    try {
      const { data } = await api.get<Note[]>("/notes");
      const nextNotes = Array.isArray(data) ? data : [];
      setCachedNotes(nextNotes);

      const nextNote = nextNotes.find((item) => item.id === numericNoteId);

      if (!nextNote) {
        setNote(null);
        setLoadState("not-found");
        return;
      }

      setNote(nextNote);
      setLoadState("ready");
    } catch (err: any) {
      setNote(null);
      setErrorMessage(err.response?.data?.error || "获取笔记失败");
      setLoadState("error");
    }
  }, [numericNoteId]);

  useEffect(() => {
    void fetchNote();
  }, [fetchNote]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/note");
  }, []);

  if (loadState === "ready" && note) {
    return <NoteViewer note={note} onBack={handleBack} />;
  }

  return (
    <View className="flex-1 bg-white px-6 py-5">
      <View className="flex-row items-center justify-between pb-5">
        <Pressable onPress={handleBack} className="px-1 py-2">
          <Text className="text-base text-[#007AFF]">返回</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center gap-3">
        {loadState === "loading" ? (
          <>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text className="text-base text-gray-500">正在加载笔记</Text>
          </>
        ) : (
          <>
            <Text className="text-lg font-semibold text-gray-800">
              {loadState === "not-found" ? "笔记不存在" : "加载失败"}
            </Text>
            <Text className="text-center text-sm text-gray-500">
              {loadState === "not-found"
                ? "当前笔记可能已被删除或链接无效"
                : errorMessage}
            </Text>
            <Pressable
              onPress={() => {
                void fetchNote();
              }}
              className="mt-2 rounded-full bg-[#007AFF] px-5 py-2"
            >
              <Text className="font-semibold text-white">重试</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}