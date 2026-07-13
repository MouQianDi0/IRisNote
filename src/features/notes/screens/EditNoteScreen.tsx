import { getNotes } from "../api/notes.api";
import NoteEditor from "../components/editor/NoteEditor";
import NoteDetailStateView, {
  type NoteDetailState,
} from "../components/viewer/NoteDetailStateView";
import { getCachedNoteById, setCachedNotes } from "../notes.cache";
import type { Note } from "../notes.types";
import { getApiErrorMessage } from "@/shared/http/errors";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

type LoadState = "loading" | "ready" | "error" | "not-found";

export default function EditNoteScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const [note, setNote] = useState<Note | null>(null);
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
      setNote(null);
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
      const notes = await getNotes();
      setCachedNotes(notes);

      const nextNote = notes.find((item) => item.id === noteId) ?? null;
      setNote(nextNote);
      setLoadState(nextNote ? "ready" : "not-found");
    } catch (error: unknown) {
      setNote(null);
      setErrorMessage(getApiErrorMessage(error, "获取笔记失败"));
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

  const detailState: NoteDetailState =
    loadState === "ready" ? "not-found" : loadState;

  return (
    <NoteDetailStateView
      loadState={detailState}
      errorMessage={errorMessage}
      onBack={goBack}
      onRetry={loadNote}
    />
  );
}
