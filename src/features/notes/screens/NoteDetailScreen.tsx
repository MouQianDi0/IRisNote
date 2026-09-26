import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { Note } from "@/features/notes/notes.types";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { noteSyncErrorMessage } from "../api/notes-sync.types";
import NoteDetailStateView, {
    type NoteDetailState,
} from "../components/viewer/NoteDetailStateView";
import NoteViewer from "../components/viewer/NoteViewer";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import { getCachedNoteById, setCachedNotes } from "../notes.cache";
import { syncNotes } from "../services/note-sync-coordinator";

type LoadState = "loading" | "ready" | "error" | "not-found" | "local-only";

export default function NoteDetailScreen() {
    const database = useApplicationDatabase();
    const { user } = useAuth();
    const { enabled: cloudEnabled, generation: cloudGeneration } =
        useCloudStorage();
    const requestGeneration = useRef(0);
    const params = useLocalSearchParams<{
        id?: string | string[];
        edit?: string | string[];
    }>();
    const [note, setNote] = useState<Note | null>(null);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const initialEdit =
        (Array.isArray(params.edit) ? params.edit[0] : params.edit) === "1";

    const numericNoteId = useMemo(() => {
        const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
        const parsedId = Number(rawId);

        if (!rawId || !Number.isInteger(parsedId) || parsedId === 0) {
            return null;
        }

        return parsedId;
    }, [params.id]);

    const fetchNote = useCallback(async () => {
        const generation = ++requestGeneration.current;
        const isCurrent = () =>
            requestGeneration.current === generation &&
            getCloudStorageSnapshot().generation === cloudGeneration;
        if (numericNoteId == null || !user) {
            setNote(null);
            setLoadState("not-found");
            return;
        }

        const cachedNote = getCachedNoteById(numericNoteId, user.id);
        if (cachedNote) {
            setNote(cachedNote);
            setLoadState("ready");
            return;
        }

        setLoadState("loading");
        setErrorMessage("");

        try {
            const localNote = await getLocalNoteByClientId(
                database,
                user.id,
                numericNoteId,
            );
            if (!isCurrent()) return;
            if (localNote) {
                setNote(localNote);
                setLoadState("ready");
                return;
            }

            if (!cloudEnabled) {
                setNote(null);
                setLoadState("local-only");
                return;
            }
            const checkAccess = captureCloudStorageAccess(user.id);
            const { notes: nextNotes } = await syncNotes(database, user.id);
            checkAccess();
            if (!isCurrent()) return;
            setCachedNotes(nextNotes);

            const nextNote = nextNotes.find(
                (item) => item.id === numericNoteId,
            );

            if (!nextNote) {
                setNote(null);
                setLoadState("not-found");
                return;
            }

            setNote(nextNote);
            setLoadState("ready");
        } catch (err: unknown) {
            if (!isCurrent()) return;
            setNote(null);
            if (isCloudStoragePermissionError(err)) {
                setLoadState("local-only");
                return;
            }
            setErrorMessage(noteSyncErrorMessage(err));
            setLoadState("error");
        }
    }, [cloudEnabled, cloudGeneration, database, numericNoteId, user]);

    useEffect(() => {
        // 微任务中加载，避免 effect 体内同步 setState 触发级联渲染。
        void Promise.resolve().then(fetchNote);
        return () => {
            requestGeneration.current += 1;
        };
    }, [fetchNote]);

    useFocusEffect(
        useCallback(() => {
            if (numericNoteId == null || !user) return;

            const frameId = requestAnimationFrame(() => {
                const cachedNote = getCachedNoteById(numericNoteId, user.id);
                if (!cachedNote) return;

                setNote((currentNote) =>
                    currentNote === cachedNote ? currentNote : cachedNote,
                );
                setLoadState("ready");
            });

            return () => cancelAnimationFrame(frameId);
        }, [numericNoteId, user]),
    );

    const handleBack = useCallback(() => {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace("/note");
    }, []);

    if (loadState === "ready" && note) {
        return (
            <NoteViewer
                note={note}
                onBack={handleBack}
                initialEdit={initialEdit}
            />
        );
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
