import { getApiErrorMessage } from "@/api/errors";
import { getNotes } from "@/api/notes";
import NoteViewer, { type NoteViewerNote } from "@/components/Note/NoteViewer";
import NoteDetailStateView, {
  type NoteDetailState,
} from "@/components/Note/Viewer/NoteDetailStateView";
import { getCachedNoteById, setCachedNotes } from "@/data/notes";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

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
      const nextNotes = await getNotes();
      setCachedNotes(nextNotes);

      const nextNote = nextNotes.find((item) => item.id === numericNoteId);

      if (!nextNote) {
        setNote(null);
        setLoadState("not-found");
        return;
      }

      setNote(nextNote);
      setLoadState("ready");
    } catch (err: unknown) {
      setNote(null);
      setErrorMessage(getApiErrorMessage(err, "获取笔记失败"));
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

  const detailState: NoteDetailState =
    loadState === "ready" ? "not-found" : loadState;

  return (
    <NoteDetailStateView
      loadState={detailState}
      errorMessage={errorMessage}
      onBack={handleBack}
      onRetry={fetchNote}
    />
  );
}
