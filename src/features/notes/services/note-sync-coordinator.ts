import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
    subscribeCloudStorage,
} from "@/core/cloud-storage/cloud-storage-policy";
import {
    onConnectionEvent,
    onConnectionReset,
} from "@/shared/http/connection-events";
import { notesSyncTransport } from "../api/notes-sync.api";
import type { NotesSyncTransport } from "../api/notes-sync.types";
import { getLocalNotes } from "../data/note-local.repository";
import { removeCachedNoteById, setCachedNote } from "../notes.cache";
import {
    noteCloudWriteStamp,
    notifyNotesChanged,
    onNoteCloudWrite,
} from "../notes.events";
import { runNoteSync } from "./note-sync.service";
import { synchronizeNoteTrash } from "./note-trash.service";
import { syncLocalNoteFlags } from "./note-flags.service";

type Result = Awaited<ReturnType<typeof runNoteSync>>;
const jobs = new WeakMap<
    ApplicationDatabase,
    Map<
        number,
        {
            controller: AbortController;
            promise: Promise<Result>;
            restore: boolean;
        }
    >
>();
const controllers = new Set<AbortController>();
const cacheMaintenance = new WeakMap<ApplicationDatabase, Set<number>>();

export async function withNoteCacheMaintenance<T>(
    db: ApplicationDatabase,
    owner: number,
    task: () => Promise<T>,
) {
    let owners = cacheMaintenance.get(db);
    if (!owners) {
        owners = new Set();
        cacheMaintenance.set(db, owners);
    }
    if (owners.has(owner)) throw new Error("笔记正文正在释放，请稍后重试");
    owners.add(owner);
    try {
        const running = jobs.get(db)?.get(owner);
        running?.controller.abort();
        if (running) await running.promise.catch(() => {});
        return await task();
    } finally {
        owners.delete(owner);
    }
}
subscribeCloudStorage(() =>
    controllers.forEach((controller) => controller.abort()),
);
let session = 0;
let currentOwner: number | null = null;
onConnectionReset(() => {
    session++;
    currentOwner = null;
    controllers.forEach((controller) => controller.abort());
});
export function setNoteSyncOwner(owner: number | null) {
    if (currentOwner === owner) return;
    // Changing A -> B -> A must never revive a request issued in the first A session.
    session++;
    controllers.forEach((controller) => controller.abort());
    currentOwner = owner;
}

export function syncNotes(
    db: ApplicationDatabase,
    owner: number,
    restore?: {
        transport: NotesSyncTransport;
        signal: AbortSignal;
        check: () => void;
    },
): Promise<Result> {
    if (cacheMaintenance.get(db)?.has(owner))
        return Promise.reject(new Error("笔记正文正在释放，请稍后同步"));
    // Return a rejected Promise (rather than throwing before callers attach .catch).
    let checkPermission: () => void;
    try {
        checkPermission = restore?.check ?? captureCloudStorageAccess(owner);
        checkPermission();
    } catch (error) {
        return Promise.reject(error);
    }
    let owners = jobs.get(db);
    if (!owners) {
        owners = new Map();
        jobs.set(db, owners);
    }
    const existing = owners.get(owner);
    if (existing) {
        // Recovery must not inherit the upload steps of a normal sync. Drain it first.
        if (
            (restore && !existing.restore) ||
            existing.controller.signal.aborted
        ) {
            existing.controller.abort();
            return existing.promise
                .catch(() => {})
                .then(() => syncNotes(db, owner, restore));
        }
        return existing.promise;
    }
    const generation = session;
    const controller = new AbortController();
    const abort = () => controller.abort();
    restore?.signal.addEventListener("abort", abort);
    if (restore?.signal.aborted) abort();
    let stamp = noteCloudWriteStamp();
    const check = () => {
        checkPermission();
        if (
            (!restore &&
                (generation !== session || currentOwner !== owner)) ||
            controller.signal.aborted
        )
            throw new Error("笔记同步账号已变化");
        const now = noteCloudWriteStamp();
        if (stamp.busy || now.busy || stamp.version !== now.version)
            throw new Error("笔记正在写入，将在写入完成后继续同步");
    };
    if (!restore) controllers.add(controller);
    const promise = (async () => {
        check();
        // Trash has its own durable receipts; an unavailable trash endpoint must not block normal sync.
        if (!restore) {
            await synchronizeNoteTrash(db, owner).catch(() => {});
            await syncLocalNoteFlags(db, owner).catch(() => {});
        }
        stamp = noteCloudWriteStamp();
        check();
        const before = await getLocalNotes(db, owner);
        const result = await runNoteSync(
            db,
            owner,
            restore?.transport ?? notesSyncTransport,
            controller.signal,
            check,
        );
        check();
        const ids = new Set(result.notes.map((note) => note.id));
        for (const note of before)
            if (!ids.has(note.id)) {
                removeCachedNoteById(note.id, owner);
                notifyNotesChanged({
                    type: "remove",
                    noteId: note.id,
                    ownerUserId: owner,
                });
            }
        const previous = new Map(
            before.map((note) => [note.id, JSON.stringify(note)]),
        );
        for (const note of result.notes) {
            if (previous.get(note.id) === JSON.stringify(note)) continue;
            setCachedNote(note);
            notifyNotesChanged({ type: "upsert", note });
        }
        return result;
    })().finally(() => {
        restore?.signal.removeEventListener("abort", abort);
        controllers.delete(controller);
        if (owners.get(owner)?.controller === controller) owners.delete(owner);
    });
    owners.set(owner, { controller, promise, restore: !!restore });
    return promise;
}

/** Consecutive writes restart this wait so a burst of edits pulls once. */
export const NOTE_SYNC_AFTER_WRITE_MS = 1500;

/** Only runs while the app is active. Concurrent screen requests join the same job. */
export function startNoteSyncCoordinator(
    db: ApplicationDatabase,
    owner: number,
) {
    const abortNormalJob = () => {
        const job = jobs.get(db)?.get(owner);
        if (job && !job.restore) job.controller.abort();
    };
    let active = false,
        stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
        timer = undefined;
        if (!active || stopped) return;
        if (!getCloudStorageSnapshot().enabled) {
            void synchronizeNoteTrash(db, owner).catch(() => {});
            return;
        }
        const stamp = noteCloudWriteStamp();
        const wasRunning = jobs.get(db)?.has(owner);
        void syncNotes(db, owner).catch(() => {
            const now = noteCloudWriteStamp();
            if (!now.busy && (wasRunning || now.version !== stamp.version))
                request();
        });
    };
    const request = () => {
        if (!active || stopped || timer) return;
        timer = setTimeout(run, 100);
    };
    const requestAfterWrite = () => {
        if (!active || stopped) return;
        clearTimeout(timer);
        timer = setTimeout(run, NOTE_SYNC_AFTER_WRITE_MS);
    };
    const unsubscribe = onNoteCloudWrite(requestAfterWrite);
    const expiryTimer = setInterval(request, 60_000);
    let unavailable = false;
    const unsubscribeConnection = onConnectionEvent((event) => {
        if (event.outcome === "unavailable") unavailable = true;
        else if (unavailable && event.outcome === "success") {
            unavailable = false;
            request();
        }
    });
    return {
        setActive(value: boolean) {
            active = value;
            if (value) request();
            else abortNormalJob();
        },
        stop() {
            stopped = true;
            clearInterval(expiryTimer);
            unsubscribe();
            unsubscribeConnection();
            if (timer) clearTimeout(timer);
            abortNormalJob();
        },
    };
}
