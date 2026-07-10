import api from "@/api/client";
import NoteEditor from "@/components/Note/NoteEditor";
import NoteDetailStateView, {
  type NoteDetailState,
} from "@/components/Note/Viewer/NoteDetailStateView";
import {
  getCachedNoteById,
  setCachedNotes,
  type CachedNote,
} from "@/data/notes";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function EditNotePage() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const [note, setNote] = useState<CachedNote | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const noteId = useMemo(() => {
    const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
    const parsedId = Number(rawId);
    return rawId && Number.isInteger(parsedId) && parsedId > 0
      ? parsedId
      : null;
  }, [params.id]);

  const loadNote = useCallback(async () => {
    if (noteId == null) {
      setLoadState("not-found");
      return;
    }

    const cachedNote = getCachedNoteById(noteId);
    if (cachedNote) {
      setNote(cachedNote);
      setLoadState("ready");
      return;
    }

    setLoadState("loading");
    setErrorMessage("");
    try {
      const { data } = await api.get<CachedNote[]>("/notes");
      const notes = Array.isArray(data) ? data : [];
      setCachedNotes(notes);
      const nextNote = notes.find((item) => item.id === noteId) ?? null;
      setNote(nextNote);
      setLoadState(nextNote ? "ready" : "not-found");
    } catch (err: any) {
      setErrorMessage(err.response?.data?.error || "获取笔记失败");
      setLoadState("error");
    }
  }, [noteId]);

  useEffect(() => {
    void loadNote();
  }, [loadNote]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/note");
  }, []);

  if (loadState === "ready" && note) {
    return <NoteEditor note={note} onCancel={goBack} onSaved={goBack} />;
  }

  return (
    <NoteDetailStateView
      loadState={loadState as NoteDetailState}
      errorMessage={errorMessage}
      onBack={goBack}
      onRetry={loadNote}
    />
  );
}
