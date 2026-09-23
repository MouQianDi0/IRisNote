import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    getCloudStorageSnapshot,
} from "@/core/cloud-storage/cloud-storage-policy";
import { getApiErrorMessage } from "@/shared/http/errors";
import { notesTrashApi } from "../api/notes-trash.api";
import { type CloudNote } from "../api/notes-sync.types";
import {
    type DeletedCloudNote,
    type NoteDeletion,
    type TrashState,
} from "../api/notes-trash.types";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import {
    archiveLocalNote,
    listNoteTrash,
    purgeLocalTrash,
    readTrash,
    recordRemoteDeletion,
    restoreArchivedNote,
    trashReceipt,
    type TrashRow,
} from "../data/note-trash.repository";
import {
    beginNoteCloudWrite,
    noteCloudWriteStamp,
    notifyNotesChanged,
} from "../notes.events";
import { removeCachedNoteById, setCachedNote } from "../notes.cache";

const jobs = new WeakMap<ApplicationDatabase, Map<number, Promise<unknown>>>();
function serialize<T>(
    db: ApplicationDatabase,
    owner: number,
    task: () => Promise<T>,
): Promise<T> {
    let owners = jobs.get(db);
    if (!owners) {
        owners = new Map();
        jobs.set(db, owners);
    }
    const previous = owners.get(owner) ?? Promise.resolve();
    const promise = previous.catch(() => {}).then(task);
    owners.set(owner, promise);
    void promise
        .finally(() => {
            if (owners.get(owner) === promise) owners.delete(owner);
        })
        .catch(() => {});
    return promise;
}
function sessionCheck(owner: number) {
    const snapshot = getCloudStorageSnapshot();
    return () => {
        const now = getCloudStorageSnapshot();
        if (
            snapshot.ownerUserId !== owner ||
            now.ownerUserId !== owner ||
            now.generation !== snapshot.generation
        )
            throw new Error("账号或云存储权限已变化，请重试");
    };
}
function removed(owner: number, clientId: number) {
    removeCachedNoteById(clientId, owner);
    notifyNotesChanged({
        type: "remove",
        ownerUserId: owner,
        noteId: clientId,
    });
}
async function purgeContents(
    db: ApplicationDatabase,
    owner: number,
    row: TrashRow,
    check: () => void,
) {
    const { savedDraftFiles } = await import("../data/saved-draft-files");
    await db.transaction(async (tx) => {
        check();
        const current = await readTrash(tx, owner, row.client_id);
        if (
            !current ||
            current.version !== row.version ||
            current.deleted_at !== row.deleted_at ||
            current.state !== row.state
        )
            return;
        if (
            await tx.getFirst(
                "SELECT 1 FROM local_notes WHERE owner_user_id=? AND client_id=?",
                [owner, row.client_id],
            )
        )
            return;
        for (const key of await savedDraftFiles.keys(owner)) {
            check();
            const text = await savedDraftFiles.read(owner, key);
            const draft: unknown = text === null ? null : JSON.parse(text);
            if (
                draft &&
                typeof draft === "object" &&
                "owner_user_id" in draft &&
                draft.owner_user_id === owner &&
                "note_id" in draft &&
                draft.note_id === row.client_id
            ) {
                check();
                await savedDraftFiles.remove(owner, key);
            }
        }
        check();
        await purgeLocalTrash(tx, owner, current);
    });
}
async function restored(
    db: ApplicationDatabase,
    owner: number,
    row: TrashRow,
    check: () => void,
    cloud?: CloudNote,
) {
    const finish = beginNoteCloudWrite();
    try {
        await db.transaction(async (tx) => {
            check();
            const current = await readTrash(tx, owner, row.client_id);
            if (
                !current ||
                current.version !== row.version ||
                current.deleted_at !== row.deleted_at
            )
                throw new Error("垃圾桶状态已变化，请刷新重试");
            await restoreArchivedNote(tx, owner, current, cloud);
            check();
        });
        check();
        const note = await getLocalNoteByClientId(db, owner, row.client_id);
        if (note) {
            check();
            setCachedNote(note);
            notifyNotesChanged({ type: "upsert", note });
        }
    } finally {
        finish();
    }
}
async function rememberDeletion(
    db: ApplicationDatabase,
    owner: number,
    receipt: NoteDeletion,
    check: () => void,
    cloud?: DeletedCloudNote,
) {
    let finish: (() => void) | undefined;
    try {
        const clientId = await db.transaction(async (tx) => {
            check();
            const active = await tx.getFirst<{ client_id: number }>(
                "SELECT client_id FROM local_notes WHERE owner_user_id=? AND server_id=?",
                [owner, receipt.id],
            );
            if (active) finish = beginNoteCloudWrite();
            await recordRemoteDeletion(tx, owner, receipt, cloud);
            const row = await tx.getFirst<TrashRow>(
                "SELECT * FROM note_trash WHERE owner_user_id=? AND server_id=?",
                [owner, receipt.id],
            );
            if (!row) return null; // A delayed response for an already purged identity carries no new content.
            const archived = await archiveLocalNote(tx, owner, row.client_id);
            check();
            return archived && active ? row.client_id : null;
        });
        check();
        if (clientId !== null) removed(owner, clientId);
    } finally {
        finish?.();
    }
}
async function rememberError(
    db: ApplicationDatabase,
    owner: number,
    row: TrashRow,
    error: unknown,
    check: () => void,
) {
    check();
    await db.run(
        "UPDATE note_trash SET last_error=? WHERE owner_user_id=? AND client_id=? AND version=? AND deleted_at IS ?",
        [
            getApiErrorMessage(error, "操作失败，将在联网后重试"),
            owner,
            row.client_id,
            row.version,
            row.deleted_at,
        ],
    );
}
async function acceptState(
    db: ApplicationDatabase,
    owner: number,
    row: TrashRow,
    state: TrashState,
    check: () => void,
) {
    check();
    const identity =
        state.state === "active" || state.state === "deleted"
            ? state.note
            : state.deletion;
    if (row.cloud_id !== null && identity.client_id !== row.cloud_id)
        throw new Error("垃圾桶笔记身份已变化，已保留本地内容");
    if (state.state === "active") {
        await restored(db, owner, row, check, state.note);
    } else if (state.state === "deleted") {
        await rememberDeletion(db, owner, state.note, check, state.note);
    } else {
        await rememberDeletion(db, owner, state.deletion, check);
        if (state.state === "purged") {
            const current = await readTrash(db, owner, row.client_id);
            if (current) await purgeContents(db, owner, current, check);
        }
    }
}
async function finishDelete(
    db: ApplicationDatabase,
    owner: number,
    row: TrashRow,
    check: () => void,
) {
    if (!row.server_id || !row.cloud_id) throw new Error("待删除笔记身份无效");
    check();
    const result = await notesTrashApi.remove(
        owner,
        row.server_id,
        row.cloud_id,
        row.version,
    );
    check();
    await rememberDeletion(db, owner, result, check, result);
}

export function trashNote(
    db: ApplicationDatabase,
    owner: number,
    clientId: number,
) {
    const check = sessionCheck(owner);
    return serialize(db, owner, async () => {
        check();
        if (noteCloudWriteStamp().busy)
            throw new Error("笔记正在同步，请完成后再删除");
        const finish = beginNoteCloudWrite();
        try {
            const pending = await readTrash(db, owner, clientId);
            if (pending) {
                if (pending.state === "deleting")
                    await finishDelete(
                        db,
                        owner,
                        pending,
                        captureCloudStorageAccess(owner),
                    );
                return;
            }
            const note = await getLocalNoteByClientId(db, owner, clientId);
            if (!note) throw new Error("笔记状态已变化，请刷新后重试");
            let active: CloudNote | undefined;
            let cloudCheck = check;
            if (note.server_id != null) {
                cloudCheck = captureCloudStorageAccess(owner);
                const state = await notesTrashApi.status(owner, note.server_id);
                cloudCheck();
                if (state.state !== "active") {
                    const receipt =
                        state.state === "deleted" ? state.note : state.deletion;
                    await rememberDeletion(
                        db,
                        owner,
                        receipt,
                        cloudCheck,
                        state.state === "deleted" ? state.note : undefined,
                    );
                    return;
                }
                active = state.note;
            }
            await db.transaction(async (tx) => {
                cloudCheck();
                await archiveLocalNote(
                    tx,
                    owner,
                    clientId,
                    active ? "deleting" : "local",
                    active,
                    true,
                );
                cloudCheck();
            });
            cloudCheck();
            removed(owner, clientId);
            const row = await readTrash(db, owner, clientId);
            if (!row) throw new Error("本地笔记状态已变化，请刷新后重试");
            if (active) {
                try {
                    await finishDelete(db, owner, row, cloudCheck);
                } catch (error) {
                    await rememberError(db, owner, row, error, cloudCheck);
                    throw error;
                }
            }
        } finally {
            finish();
        }
    });
}

export function restoreTrashedNote(
    db: ApplicationDatabase,
    owner: number,
    clientId: number,
) {
    const check = sessionCheck(owner);
    return serialize(db, owner, async () => {
        check();
        const row = await readTrash(db, owner, clientId);
        if (!row) throw new Error("笔记已恢复或清理，请刷新列表");
        if (row.state === "local") {
            if (!row.expires_at || Date.now() >= Date.parse(row.expires_at))
                throw new Error("笔记已超过 15 天保留期限，无法恢复");
            await restored(db, owner, row, check);
            return;
        }
        const checkCloud = captureCloudStorageAccess(owner);
        const finish = beginNoteCloudWrite();
        try {
            const status = await notesTrashApi.status(owner, row.server_id!);
            checkCloud();
            if (status.state === "active") {
                if (
                    row.state === "deleting" &&
                    status.note.version === row.version &&
                    status.note.client_id === row.cloud_id
                ) {
                    // Fence a timed-out delete that could otherwise commit after this status read.
                    const receipt = await notesTrashApi.remove(
                        owner,
                        row.server_id!,
                        row.cloud_id,
                        row.version,
                    );
                    checkCloud();
                    const cloud = await notesTrashApi.restore(owner, receipt);
                    checkCloud();
                    await restored(db, owner, row, checkCloud, cloud);
                } else await restored(db, owner, row, checkCloud, status.note);
                return;
            }
            if (status.state !== "deleted") {
                await acceptState(db, owner, row, status, checkCloud);
                throw new Error("笔记已到期或清理，无法恢复");
            }
            // Do not let an old restore intent revive a later, separate deletion.
            if (
                row.state !== "deleting" &&
                row.state !== "unresolved" &&
                (status.note.version !== row.version ||
                    status.note.deleted_at !== row.deleted_at)
            ) {
                await acceptState(db, owner, row, status, checkCloud);
                throw new Error("笔记删除状态已变化，请核对后重新恢复");
            }
            const cloud = await notesTrashApi.restore(owner, status.note);
            checkCloud();
            await restored(db, owner, row, checkCloud, cloud);
        } finally {
            finish();
        }
    });
}

/** Durable trash rows are the cleanup queue. No background timer is required while the app is closed. */
export function synchronizeNoteTrash(db: ApplicationDatabase, owner: number) {
    const check = sessionCheck(owner);
    return serialize(db, owner, async () => {
        check();
        for (const row of await listNoteTrash(db, owner)) {
            if (
                row.state === "local" &&
                row.expires_at &&
                Date.parse(row.expires_at) <= Date.now()
            ) {
                await purgeContents(db, owner, row, check);
            }
        }
        const access = getCloudStorageSnapshot();
        if (!access.enabled) return;
        const checkCloud = captureCloudStorageAccess(owner);
        const page = await notesTrashApi.list(owner);
        checkCloud();
        await db.run(
            "INSERT INTO note_trash_clock(owner_user_id,offset_ms) VALUES(?,?) ON CONFLICT(owner_user_id) DO UPDATE SET offset_ms=excluded.offset_ms",
            [owner, Date.parse(page.server_now) - Date.now()],
        );
        const ids = new Set(
            [...page.data, ...page.expired].map((note) => note.id),
        );
        for (const cloud of page.data)
            await rememberDeletion(db, owner, cloud, checkCloud, cloud);
        for (const receipt of page.expired)
            await rememberDeletion(db, owner, receipt, checkCloud);
        for (const row of await listNoteTrash(db, owner)) {
            checkCloud();
            if (row.server_id === null) continue;
            try {
                if (row.state === "deleting") {
                    try {
                        await finishDelete(db, owner, row, checkCloud);
                    } catch (error) {
                        const state = await notesTrashApi.status(
                            owner,
                            row.server_id,
                        );
                        checkCloud();
                        if (
                            state.state === "active" &&
                            state.note.version === row.version
                        )
                            throw error;
                        await acceptState(db, owner, row, state, checkCloud);
                    }
                } else if (!ids.has(row.server_id)) {
                    const state = await notesTrashApi.status(
                        owner,
                        row.server_id,
                    );
                    await acceptState(db, owner, row, state, checkCloud);
                } else if (
                    row.state === "deleted" &&
                    row.expires_at &&
                    Date.parse(row.expires_at) <= Date.parse(page.server_now)
                ) {
                    await notesTrashApi.purge(trashReceipt(row));
                    checkCloud();
                    await purgeContents(db, owner, row, checkCloud);
                }
            } catch (error) {
                await rememberError(db, owner, row, error, checkCloud);
            }
        }
    });
}
