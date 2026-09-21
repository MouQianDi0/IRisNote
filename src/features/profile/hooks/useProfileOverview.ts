import { useApplicationDatabase } from "@/core/database";
import { getCategories } from "@/features/notes/categories/api/categories.api";
import { getLocalNotes } from "@/features/notes/data/note-local.repository";
import { readingProgressStore } from "@/features/notes/data/note-reading-progress";
import { syncNotes } from "@/features/notes/services/note-sync-coordinator";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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

async function loadProfileOverview(
    database: ReturnType<typeof useApplicationDatabase>,
    ownerUserId: number,
): Promise<ProfileOverview> {
    const [syncResult, categoriesResult] = await Promise.allSettled([
        syncNotes(database, ownerUserId),
        getCategories(),
    ]);
    const localResult = await Promise.allSettled([
        getLocalNotes(database, ownerUserId),
    ]);
    const notesAvailable =
        localResult[0].status === "fulfilled" ||
        syncResult.status === "fulfilled";
    const notes =
        localResult[0].status === "fulfilled"
            ? localResult[0].value
            : syncResult.status === "fulfilled"
              ? syncResult.value.notes
              : [];
    const records = notesAvailable
        ? await readingProgressStore.list(ownerUserId).catch(() => [])
        : [];

    return {
        noteCount: notesAvailable ? notes.length : null,
        categoryCount:
            categoriesResult.status === "fulfilled"
                ? categoriesResult.value.length
                : null,
        starredCount: notesAvailable
            ? notes.filter((note) => note.is_starred).length
            : null,
        continueReading: selectContinueReading(notes, records),
    };
}

export function useProfileOverview(ownerUserId?: number) {
    const database = useApplicationDatabase();
    const [overview, setOverview] = useState<ProfileOverview>(emptyOverview);
    const [loading, setLoading] = useState(ownerUserId != null);

    useFocusEffect(
        useCallback(() => {
            let active = true;

            if (ownerUserId == null) {
                setOverview(emptyOverview);
                setLoading(false);
                return () => {
                    active = false;
                };
            }

            setLoading(true);
            void loadProfileOverview(database, ownerUserId)
                .then((nextOverview) => {
                    if (active) setOverview(nextOverview);
                })
                .finally(() => {
                    if (active) setLoading(false);
                });

            return () => {
                active = false;
            };
        }, [database, ownerUserId]),
    );

    return { overview, loading };
}
