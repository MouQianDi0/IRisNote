import { useApplicationDatabase } from "@/core/database";
import { getCategories } from "@/features/notes/categories/api/categories.api";
import { getLocalNotes } from "@/features/notes/data/note-local.repository";
import { getNotes } from "@/features/notes/api/notes.api";
import { readingProgressStore } from "@/features/notes/data/note-reading-progress";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    mergeOverviewNotes,
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
    const [localResult, serverResult, categoriesResult] =
        await Promise.allSettled([
            getLocalNotes(database, ownerUserId),
            getNotes(),
            getCategories(),
        ]);

    const notesAvailable =
        localResult.status === "fulfilled" || serverResult.status === "fulfilled";
    const notes = mergeOverviewNotes(
        localResult.status === "fulfilled" ? localResult.value : [],
        serverResult.status === "fulfilled" ? serverResult.value : [],
    );
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
