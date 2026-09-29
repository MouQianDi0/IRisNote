import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    captureLocalStorageAccess,
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
    readTrashIntent,
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
    return captureLocalStorageAccess(owner);
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
                if (
                    !getCloudStorageSnapshot().enabled ||
                    (await readTrashIntent(db, owner, clientId))
                )
                    return;
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
            const restoreIntent = await readTrashIntent(db, owner, clientId);
            if (restoreIntent?.intent === "restore") {
                const receipt = JSON.parse(
                    restoreIntent.receipt_json,
                ) as TrashRow;
                await db.transaction(async (tx) => {
                    check();
                    await tx.run(
                        "DELETE FROM note_trash_intents WHERE owner_user_id=? AND client_id=?",
                        [owner, clientId],
                    );
                    await archiveLocalNote(
                        tx,
                        owner,
                        clientId,
                        "local",
                        undefined,
                        true,
                    );
                    await tx.run(
                        "UPDATE note_trash SET state=?,cloud_id=?,version=?,deleted_at=?,expires_at=?,cloud_json=? WHERE owner_user_id=? AND client_id=?",
                        [
                            receipt.state,
                            receipt.cloud_id,
                            receipt.version,
                            receipt.deleted_at,
                            receipt.expires_at,
                            receipt.cloud_json,
                            owner,
                            clientId,
                        ],
                    );
                    check();
                });
                removed(owner, clientId);
                return;
            }
            if (!getCloudStorageSnapshot().enabled && note.server_id != null) {
                await db.transaction(async (tx) => {
                    check();
                    const mirror = await tx.getFirst<{
                        cloud_id: string;
                        version: number;
                    }>(
                        "SELECT cloud_id,version FROM note_sync_mirror WHERE owner_user_id=? AND server_id=?",
                        [owner, note.server_id!],
                    );
                    await archiveLocalNote(
                        tx,
                        owner,
                        clientId,
                        "local",
                        undefined,
                        true,
                    );
                    await tx.run(
                        "INSERT INTO note_trash_intents(owner_user_id,client_id,intent,receipt_json) VALUES(?,?,'delete',?) ON CONFLICT(owner_user_id,client_id) DO UPDATE SET intent='delete',receipt_json=excluded.receipt_json",
                        [
                            owner,
                            clientId,
                            JSON.stringify({
                                server_id: note.server_id,
                                cloud_id: mirror?.cloud_id ?? null,
                                version: mirror?.version ?? 0,
                                updated_at: note.server_updated_at ?? null,
                            }),
                        ],
                    );
                    check();
                });
                removed(owner, clientId);
                return;
            }
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
        const localIntent = await readTrashIntent(db, owner, clientId);
        const deletionAttempt =
            localIntent?.intent === "delete"
                ? (JSON.parse(localIntent.receipt_json) as {
                      dispatched?: boolean;
                      cloud_id: string | null;
                      version: number;
                  })
                : null;
        if (
            !getCloudStorageSnapshot().enabled ||
            localIntent?.intent === "delete"
        ) {
            if (row.expires_at && Date.now() >= Date.parse(row.expires_at))
                throw new Error("笔记已超过 15 天保留期限，无法恢复");
            await db.transaction(async (tx) => {
                check();
                if (
                    (localIntent?.intent === "delete" &&
                        !deletionAttempt?.dispatched) ||
                    row.server_id === null
                ) {
                    await tx.run(
                        "DELETE FROM note_trash_intents WHERE owner_user_id=? AND client_id=?",
                        [owner, clientId],
                    );
                } else {
                    await tx.run(
                        "INSERT INTO note_trash_intents(owner_user_id,client_id,intent,receipt_json) VALUES(?,?,'restore',?) ON CONFLICT(owner_user_id,client_id) DO UPDATE SET intent='restore',receipt_json=excluded.receipt_json",
                        [
                            owner,
                            clientId,
                            JSON.stringify(
                                deletionAttempt?.dispatched
                                    ? {
                                          ...row,
                                          ...deletionAttempt,
                                          state: "deleting",
                                      }
                                    : row,
                            ),
                        ],
                    );
                }
                await restoreArchivedNote(
                    tx,
                    owner,
                    row,
                    row.local_json || !row.cloud_json
                        ? undefined
                        : (JSON.parse(row.cloud_json) as CloudNote),
                );
                check();
            });
            const note = await getLocalNoteByClientId(db, owner, clientId);
            check();
            if (note) {
                setCachedNote(note);
                notifyNotesChanged({ type: "upsert", note });
            }
            return;
        }
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
        await synchronizeLocalTrashIntents(db, owner, checkCloud);
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
            if (
                row.server_id === null ||
                (await readTrashIntent(db, owner, row.client_id))
            )
                continue;
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

/** Replay local intent only against its recorded cloud identity/version. */
async function synchronizeLocalTrashIntents(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
) {
    if (
        !(await db.getFirst(
            "SELECT 1 FROM sqlite_master WHERE name='note_trash_intents'",
        ))
    )
        return;
    const intents = await db.getAll<{
        client_id: number;
        intent: "delete" | "restore";
        receipt_json: string;
    }>("SELECT * FROM note_trash_intents WHERE owner_user_id=?", [owner]);
    for (const intent of intents) {
        check();
        const receipt = JSON.parse(intent.receipt_json) as {
            server_id: number;
            cloud_id: string | null;
            version: number;
            updated_at?: string | null;
            deleted_at?: string | null;
            state?: string;
        };
        try {
            const state = await notesTrashApi.status(owner, receipt.server_id);
            check();
            const identity =
                state.state === "active" || state.state === "deleted"
                    ? state.note
                    : state.deletion;
            if (receipt.cloud_id && identity.client_id !== receipt.cloud_id)
                throw new Error("云端身份已变化，本机操作已保留");
            if (intent.intent === "delete") {
                if (state.state === "active") {
                    if (
                        receipt.version
                            ? state.note.version !== receipt.version
                            : !receipt.updated_at ||
                              state.note.updated_at !== receipt.updated_at
                    )
                        throw new Error(
                            "云端笔记已有其他修改，本机删除已保留，请核对后重试",
                        );
                    const dispatchedReceipt = JSON.stringify({
                        ...receipt,
                        cloud_id: state.note.client_id,
                        version: state.note.version,
                        dispatched: true,
                    });
                    await db.run(
                        "UPDATE note_trash_intents SET receipt_json=? WHERE owner_user_id=? AND client_id=? AND receipt_json=?",
                        [
                            dispatchedReceipt,
                            owner,
                            intent.client_id,
                            intent.receipt_json,
                        ],
                    );
                    intent.receipt_json = dispatchedReceipt;
                    check();
                    const deleted = await notesTrashApi.remove(
                        owner,
                        state.note.id,
                        state.note.client_id,
                        state.note.version,
                    );
                    check();
                    await rememberDeletion(db, owner, deleted, check, deleted);
                } else {
                    await rememberDeletion(
                        db,
                        owner,
                        state.state === "deleted" ? state.note : state.deletion,
                        check,
                        state.state === "deleted" ? state.note : undefined,
                    );
                }
            } else {
                if (state.state === "deleted") {
                    if (
                        receipt.state === "deleting"
                            ? state.note.version !== receipt.version + 1
                            : state.note.version !== receipt.version ||
                              state.note.deleted_at !== receipt.deleted_at
                    )
                        throw new Error(
                            "云端删除状态已变化，已保留本机恢复内容，请核对后重试",
                        );
                    await notesTrashApi.restore(owner, state.note);
                    check();
                } else if (
                    state.state === "active" &&
                    receipt.state === "deleting" &&
                    state.note.version === receipt.version
                ) {
                    // Fence a delayed delete before completing the local restore intent.
                    const deleted = await notesTrashApi.remove(
                        owner,
                        state.note.id,
                        state.note.client_id,
                        state.note.version,
                    );
                    check();
                    await notesTrashApi.restore(owner, deleted);
                    check();
                } else if (state.state !== "active") {
                    throw new Error("云端笔记已清理，恢复内容仍保存在本机");
                }
            }
            await db.run(
                "DELETE FROM note_trash_intents WHERE owner_user_id=? AND client_id=? AND receipt_json=?",
                [owner, intent.client_id, intent.receipt_json],
            );
        } catch (error) {
            check();
            const message =
                error instanceof Error
                    ? error.message
                    : "同步未完成，本机操作已保留";
            await db.run(
                "UPDATE note_trash SET last_error=? WHERE owner_user_id=? AND client_id=?",
                [message, owner, intent.client_id],
            );
            if (intent.intent === "restore")
                await db.run(
                    "UPDATE local_notes SET last_sync_error=? WHERE owner_user_id=? AND client_id=?",
                    [message, owner, intent.client_id],
                );
        }
    }
}
