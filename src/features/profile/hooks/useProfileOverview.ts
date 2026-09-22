import { useApplicationDatabase } from "@/core/database";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { captureCloudStorageAccess, getCloudStorageSnapshot, isCloudStoragePermissionError } from "@/core/cloud-storage/cloud-storage-policy";
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
    cloudEnabled: boolean,
    cloudGeneration: number,
): Promise<ProfileOverview> {
    const localResult = await Promise.allSettled([
        getLocalNotes(database, ownerUserId),
    ]);
    let notesAvailable = localResult[0].status === "fulfilled";
    let notes =
        localResult[0].status === "fulfilled"
            ? localResult[0].value
            : [];
    let categoryCount: number | null = null;
    const cloud = getCloudStorageSnapshot();
    if (cloudEnabled && cloud.enabled && cloud.ownerUserId === ownerUserId && cloud.generation === cloudGeneration) {
        try {
            const checkAccess = captureCloudStorageAccess(ownerUserId);
            const [syncResult, categoriesResult] = await Promise.allSettled([
                syncNotes(database, ownerUserId),
                getCategories(),
            ]);
            checkAccess();
            if (syncResult.status === "fulfilled") {
                notes = syncResult.value.notes;
                notesAvailable = true;
            }
            if (categoriesResult.status === "fulfilled") categoryCount = categoriesResult.value.length;
        } catch (error) {
            if (!isCloudStoragePermissionError(error)) throw error;
        }
    }
    const records = notesAvailable
        ? await readingProgressStore.list(ownerUserId).catch(() => [])
        : [];

    return {
        noteCount: notesAvailable ? notes.length : null,
        categoryCount,
        starredCount: notesAvailable
            ? notes.filter((note) => note.is_starred).length
            : null,
        continueReading: selectContinueReading(notes, records),
    };
}

export function useProfileOverview(ownerUserId?: number) {
    const database = useApplicationDatabase();
    const { enabled: cloudEnabled, generation: cloudGeneration } = useCloudStorage();
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
            void loadProfileOverview(database, ownerUserId, cloudEnabled, cloudGeneration)
                .then((nextOverview) => {
                    if (active && getCloudStorageSnapshot().generation === cloudGeneration) setOverview(nextOverview);
                })
                .finally(() => {
                    if (active && getCloudStorageSnapshot().generation === cloudGeneration) setLoading(false);
                });

            return () => {
                active = false;
            };
        }, [cloudEnabled, cloudGeneration, database, ownerUserId]),
    );

    return { overview, loading };
}
