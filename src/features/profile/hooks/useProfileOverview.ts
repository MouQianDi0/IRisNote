import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { getCategories } from "@/features/notes/categories/api/categories.api";
import { onCategoriesChanged } from "@/features/notes/categories/categories.events";
import { getLocalNotes } from "@/features/notes/data/note-local.repository";
import {
    onReadingProgressChanged,
    readingProgressStore,
} from "@/features/notes/data/note-reading-progress";
import { onNotesChanged } from "@/features/notes/notes.events";
import { syncNotes } from "@/features/notes/services/note-sync-coordinator";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    selectContinueReading,
    type ProfileOverview,
} from "../profile-overview";

const emptyOverview: ProfileOverview = {
    noteCount: null,
    categoryCount: null,
    starredCount: null,
    continueReading: null,
};

type OverviewState = {
    identity: string;
    overview: ProfileOverview;
    loading: boolean;
};

function sameOverview(left: ProfileOverview, right: ProfileOverview) {
    const leftReading = left.continueReading;
    const rightReading = right.continueReading;
    return (
        left.noteCount === right.noteCount &&
        left.categoryCount === right.categoryCount &&
        left.starredCount === right.starredCount &&
        (leftReading === rightReading ||
            (leftReading?.noteId === rightReading?.noteId &&
                leftReading?.title === rightReading?.title &&
                leftReading?.percent === rightReading?.percent))
    );
}

async function loadProfileOverview(
    database: ReturnType<typeof useApplicationDatabase>,
    ownerUserId: number,
    cloudEnabled: boolean,
    cloudGeneration: number,
    previousOverview: ProfileOverview,
    initial: boolean,
    categoriesChanged: boolean,
): Promise<ProfileOverview> {
    const localResult = await Promise.allSettled([
        getLocalNotes(database, ownerUserId),
    ]);
    let notesAvailable = localResult[0].status === "fulfilled";
    let notes =
        localResult[0].status === "fulfilled" ? localResult[0].value : [];
    let categoryCount = previousOverview.categoryCount;
    const cloud = getCloudStorageSnapshot();
    if (
        cloudEnabled &&
        cloud.enabled &&
        cloud.ownerUserId === ownerUserId &&
        cloud.generation === cloudGeneration
    ) {
        try {
            const checkAccess = captureCloudStorageAccess(ownerUserId);
            const [syncResult, categoriesResult] = await Promise.allSettled([
                initial ? syncNotes(database, ownerUserId) : Promise.resolve(null),
                initial || categoriesChanged
                    ? getCategories()
                    : Promise.resolve(null),
            ]);
            checkAccess();
            if (syncResult.status === "fulfilled" && syncResult.value) {
                notes = syncResult.value.notes;
                notesAvailable = true;
            }
            if (categoriesResult.status === "fulfilled" && categoriesResult.value)
                categoryCount = categoriesResult.value.length;
        } catch (error) {
            if (!isCloudStoragePermissionError(error)) throw error;
        }
    } else {
        categoryCount = null;
    }
    let continueReading = previousOverview.continueReading;
    if (notesAvailable) {
        try {
            const records = await readingProgressStore.list(ownerUserId);
            continueReading = selectContinueReading(notes, records);
        } catch {
            // 保留上次结果，等待下一次数据变化后重试读取。
        }
    }

    return {
        noteCount: notesAvailable ? notes.length : previousOverview.noteCount,
        categoryCount,
        starredCount: notesAvailable
            ? notes.filter((note) => note.is_starred).length
            : previousOverview.starredCount,
        continueReading,
    };
}

export function useProfileOverview(ownerUserId?: number) {
    const database = useApplicationDatabase();
    const { enabled: cloudEnabled, generation: cloudGeneration } =
        useCloudStorage();
    const identity = `${ownerUserId ?? "guest"}:${cloudGeneration}:${cloudEnabled}`;
    const focusedRef = useRef(false);
    const scheduleRefreshRef = useRef<(() => void) | null>(null);
    const [state, setState] = useState<OverviewState>({
        identity,
        overview: emptyOverview,
        loading: ownerUserId != null,
    });

    useEffect(() => {
        let active = true;
        let running = false;
        let scheduled = false;
        let initial = true;
        let currentOverview = emptyOverview;
        let notesChanged = false;
        let categoriesChanged = false;
        let readingChanged = false;

        void Promise.resolve().then(() => {
            if (active)
                setState({
                    identity,
                    overview: emptyOverview,
                    loading: ownerUserId != null,
                });
        });
        if (ownerUserId == null)
            return () => {
                active = false;
            };

        const scheduleRefresh = () => {
            if (!active || !focusedRef.current || scheduled) return;
            scheduled = true;
            void Promise.resolve().then(() => {
                scheduled = false;
                if (focusedRef.current) void refresh();
            });
        };
        scheduleRefreshRef.current = scheduleRefresh;
        const refresh = async () => {
            if (!active || running) return;
            if (!initial && !notesChanged && !categoriesChanged && !readingChanged)
                return;

            const firstLoad = initial;
            const refreshCategories = categoriesChanged;
            initial = false;
            notesChanged = false;
            categoriesChanged = false;
            readingChanged = false;
            running = true;
            try {
                const nextOverview = await loadProfileOverview(
                    database,
                    ownerUserId,
                    cloudEnabled,
                    cloudGeneration,
                    currentOverview,
                    firstLoad,
                    refreshCategories,
                );
                if (
                    !active ||
                    getCloudStorageSnapshot().generation !== cloudGeneration
                )
                    return;
                currentOverview = nextOverview;
                setState((previous) =>
                    previous.identity === identity &&
                    !previous.loading &&
                    sameOverview(previous.overview, nextOverview)
                        ? previous
                        : { identity, overview: nextOverview, loading: false },
                );
            } catch (error) {
                console.warn("[Profile overview] 读取失败", error);
                if (active)
                    setState({
                        identity,
                        overview: currentOverview,
                        loading: false,
                    });
            } finally {
                running = false;
                if (notesChanged || categoriesChanged || readingChanged)
                    scheduleRefresh();
            }
        };

        const unsubscribeNotes = onNotesChanged((event) => {
            const eventOwner = event.ownerUserId ?? event.note?.user_id;
            if (eventOwner !== ownerUserId) return;
            notesChanged = true;
            scheduleRefresh();
        });
        const unsubscribeCategories = onCategoriesChanged(() => {
            categoriesChanged = true;
            scheduleRefresh();
        });
        const unsubscribeReading = onReadingProgressChanged((owner) => {
            if (owner !== ownerUserId) return;
            readingChanged = true;
            scheduleRefresh();
        });
        scheduleRefresh();

        return () => {
            active = false;
            if (scheduleRefreshRef.current === scheduleRefresh)
                scheduleRefreshRef.current = null;
            unsubscribeNotes();
            unsubscribeCategories();
            unsubscribeReading();
        };
    }, [cloudEnabled, cloudGeneration, database, identity, ownerUserId]);

    useFocusEffect(
        useCallback(() => {
            focusedRef.current = true;
            scheduleRefreshRef.current?.();
            return () => {
                focusedRef.current = false;
            };
        }, []),
    );

    if (state.identity !== identity)
        return { overview: emptyOverview, loading: ownerUserId != null };
    return { overview: state.overview, loading: state.loading };
}
