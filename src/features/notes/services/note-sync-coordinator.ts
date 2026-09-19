import type { ApplicationDatabase } from "@/core/database";
import {
    onConnectionEvent,
    onConnectionReset,
} from "@/shared/http/connection-events";
import { notesSyncTransport } from "../api/notes-sync.api";
import { getLocalNotes } from "../data/note-local.repository";
import { removeCachedNoteById, setCachedNote } from "../notes.cache";
import {
    noteCloudWriteStamp,
    notifyNotesChanged,
    onNoteCloudWrite,
} from "../notes.events";
import { runNoteSync } from "./note-sync.service";

type Result = Awaited<ReturnType<typeof runNoteSync>>;
const jobs = new WeakMap<
    ApplicationDatabase,
    Map<number, { controller: AbortController; promise: Promise<Result> }>
>();
const controllers = new Set<AbortController>();
let session = 0;
let currentOwner: number | null = null;
onConnectionReset(() => {
    session++;
    currentOwner = null;
    controllers.forEach((controller) => controller.abort());
});
export function setNoteSyncOwner(owner: number | null) {
    currentOwner = owner;
}

export function syncNotes(
    db: ApplicationDatabase,
    owner: number,
): Promise<Result> {
    let owners = jobs.get(db);
    if (!owners) {
        owners = new Map();
        jobs.set(db, owners);
    }
    const existing = owners.get(owner);
    if (existing && !existing.controller.signal.aborted)
        return existing.promise;
    const generation = session;
    const controller = new AbortController();
    const stamp = noteCloudWriteStamp();
    const check = () => {
        if (
            generation !== session ||
            currentOwner !== owner ||
            controller.signal.aborted
        )
            throw new Error("笔记同步账号已变化");
        const now = noteCloudWriteStamp();
        if (stamp.busy || now.busy || stamp.version !== now.version)
            throw new Error("笔记正在写入，将在写入完成后继续同步");
    };
    controllers.add(controller);
    const promise = (async () => {
        check();
        const before = await getLocalNotes(db, owner);
        const result = await runNoteSync(
            db,
            owner,
            notesSyncTransport,
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
        controllers.delete(controller);
        if (owners.get(owner)?.controller === controller) owners.delete(owner);
    });
    owners.set(owner, { controller, promise });
    return promise;
}

/** Only runs while the app is active. Concurrent screen requests join the same job. */
export function startNoteSyncCoordinator(
    db: ApplicationDatabase,
    owner: number,
) {
    let active = false,
        stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const request = () => {
        if (!active || stopped || timer) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (!active || stopped) return;
            const stamp = noteCloudWriteStamp();
            const wasRunning = jobs.get(db)?.has(owner);
            void syncNotes(db, owner).catch(() => {
                const now = noteCloudWriteStamp();
                if (!now.busy && (wasRunning || now.version !== stamp.version))
                    request();
            });
        }, 100);
    };
    const unsubscribe = onNoteCloudWrite(request);
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
            else jobs.get(db)?.get(owner)?.controller.abort();
        },
        stop() {
            stopped = true;
            unsubscribe();
            unsubscribeConnection();
            if (timer) clearTimeout(timer);
            jobs.get(db)?.get(owner)?.controller.abort();
        },
    };
}
