import type { ApplicationDatabaseTransaction as Tx } from "@/core/database/database.types";
import type { TodoEntity } from "../todos.types";
import { TodoError } from "../todos.types";
import { newTodoId } from "../services/todo-service";
import { business, fromRemote } from "../api/todo-wire";
import {
    isDeleted,
    type TodoRemote,
    type TodoSyncRecord,
    type TodoOperation,
    type TodoRequest,
} from "../sync.types";
import { todoColumns, todoValues } from "./todo-local.repository";

type Row = {
    owner_key: string;
    client_id: string;
    sequence: number;
    candidate_json: string;
    deleted: number;
    dirty: number;
    base_json: string | null;
    remote_json: string | null;
    status: TodoSyncRecord["status"];
    error: string | null;
};
type OutboxRow = Omit<TodoOperation, "request"> & { request_json: string };
const decode = (row: Row): TodoSyncRecord => ({
    ownerKey: row.owner_key,
    clientId: row.client_id,
    sequence: row.sequence,
    candidate: JSON.parse(row.candidate_json) as TodoEntity,
    deleted: row.deleted === 1,
    dirty: row.dirty === 1,
    base: row.base_json ? (JSON.parse(row.base_json) as TodoRemote) : null,
    remote: row.remote_json
        ? (JSON.parse(row.remote_json) as TodoRemote)
        : null,
    status: row.status,
    error: row.error,
});
const encode = (value: TodoRemote | null) =>
    value ? JSON.stringify(value) : null;
export async function getSyncRecord(tx: Tx, owner: string, id: string) {
    const row = await tx.getFirst<Row>(
        "SELECT * FROM todo_sync_state WHERE owner_key=? AND client_id=?",
        [owner, id],
    );
    return row ? decode(row) : null;
}
export async function listTodoSyncRecords(
    tx: Tx,
    owner: string,
    pendingOnly = true,
) {
    return (
        await tx.getAll<Row>(
            `SELECT * FROM todo_sync_state WHERE owner_key=? ${pendingOnly ? "AND status <> 'synced'" : ""} ORDER BY client_id`,
            [owner],
        )
    ).map(decode);
}
async function put(tx: Tx, s: TodoSyncRecord) {
    await tx.run(
        `INSERT INTO todo_sync_state (owner_key,client_id,sequence,candidate_json,deleted,dirty,base_json,remote_json,status,error)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_key,client_id) DO UPDATE SET sequence=excluded.sequence,
    candidate_json=excluded.candidate_json,deleted=excluded.deleted,dirty=excluded.dirty,base_json=excluded.base_json,
    remote_json=excluded.remote_json,status=excluded.status,error=excluded.error`,
        [
            s.ownerKey,
            s.clientId,
            s.sequence,
            JSON.stringify(s.candidate),
            Number(s.deleted),
            Number(s.dirty),
            encode(s.base),
            encode(s.remote),
            s.status,
            s.error,
        ],
    );
}
export async function recordTodoChanges(
    tx: Tx,
    owner: string,
    before: readonly TodoEntity[],
    after: readonly TodoEntity[],
) {
    if (!/^user:[1-9]\d*$/.test(owner)) return;
    const old = new Map(before.map((t) => [t.clientId, t]));
    const next = new Map(after.map((t) => [t.clientId, t]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
        const previous = old.get(id);
        const current = next.get(id);
        if (previous?.localVersion === current?.localVersion) continue;
        const s = await getSyncRecord(tx, owner, id);
        const candidate = current ?? previous!;
        await put(tx, {
            ownerKey: owner,
            clientId: id,
            sequence: (s?.sequence ?? 0) + 1,
            candidate,
            deleted: !current,
            dirty: true,
            base: s?.base ?? null,
            remote: s?.remote ?? null,
            status: s?.status === "conflict" ? "conflict" : "pending",
            error: s?.status === "conflict" ? s.error : null,
        });
    }
}
export async function enlistExisting(
    tx: Tx,
    owner: string,
    entities: readonly TodoEntity[],
) {
    for (const entity of entities) {
        if (!(await getSyncRecord(tx, owner, entity.clientId)))
            await recordTodoChanges(tx, owner, [], [entity]);
    }
}
async function publish(tx: Tx, s: TodoSyncRecord, remote: TodoRemote) {
    if (isDeleted(remote)) {
        await tx.run(
            "DELETE FROM local_todos WHERE owner_key=? AND client_id=?",
            [s.ownerKey, s.clientId],
        );
        s.deleted = true;
    } else {
        const row = await tx.getFirst<{ local_version: number }>(
            "SELECT local_version FROM local_todos WHERE owner_key=? AND client_id=?",
            [s.ownerKey, s.clientId],
        );
        s.candidate = fromRemote(
            remote,
            s.ownerKey,
            Math.max(row?.local_version ?? 0, s.candidate.localVersion) + 1,
        );
        s.deleted = false;
        await writeLocal(tx, s.candidate);
    }
    s.base = remote;
    s.remote = remote;
    s.dirty = false;
    s.status = "synced";
    s.error = null;
    await put(tx, s);
}
async function writeLocal(tx: Tx, entity: TodoEntity) {
    await tx.run(
        `INSERT INTO local_todos (${todoColumns}) VALUES (${todoValues(entity)
            .map(() => "?")
            .join(",")})
    ON CONFLICT(owner_key,client_id) DO UPDATE SET ${todoColumns
        .split(", ")
        .slice(2)
        .map((c) => `${c}=excluded.${c}`)
        .join(",")}`,
        todoValues(entity),
    );
}
async function getOperation(tx: Tx, owner: string, id: string) {
    const row = await tx.getFirst<OutboxRow>(
        "SELECT * FROM todo_outbox WHERE owner_key=? AND client_id=?",
        [owner, id],
    );
    return row
        ? { ...row, request: JSON.parse(row.request_json) as TodoRequest }
        : null;
}
function newest(a: TodoRemote | null, b: TodoRemote): TodoRemote {
    if (a && a.id !== b.id) throw new Error("待办云端身份发生变化");
    return a && a.version > b.version ? a : b;
}
function conflict(
    s: TodoSyncRecord,
    message = "云端版本已变化，本地内容已保留",
) {
    s.status = "conflict";
    s.error = message;
}
/** Returns true only when the incoming record changes locally visible Todo data. */
export async function applyRemote(
    tx: Tx,
    owner: string,
    remote: TodoRemote,
): Promise<boolean> {
    let s = await getSyncRecord(tx, owner, remote.client_id);
    if (!s) {
        if (isDeleted(remote)) return false;
        s = {
            ownerKey: owner,
            clientId: remote.client_id,
            sequence: 1,
            candidate: fromRemote(remote, owner, 1),
            deleted: false,
            dirty: false,
            base: null,
            remote: null,
            status: "synced",
            error: null,
        };
    }
    const previous = s.remote;
    s.remote = newest(s.remote, remote);
    if (s.base) s.remote = newest(s.base, s.remote);
    if (previous && remote.version < previous.version) return false;
    if (!s.dirty && !(await getOperation(tx, owner, s.clientId))) {
        if (s.base?.version === s.remote.version) return false;
        await publish(tx, s, s.remote);
        return true;
    } else {
        // An uncertain sent operation must recover its receipt before conflicts can be resolved.
        if (
            !(await getOperation(tx, owner, s.clientId)) &&
            (!s.base || s.remote.version > s.base.version)
        )
            conflict(s);
        await put(tx, s);
    }
    return false;
}
export async function prepareOperations(
    tx: Tx,
    owner: string,
    now: number,
): Promise<TodoOperation[]> {
    const pending = await listTodoSyncRecords(tx, owner);
    const result: TodoOperation[] = [];
    for (const s of pending) {
        if (s.status === "conflict" || s.status === "blocked") continue;
        let op = await getOperation(tx, owner, s.clientId);
        if (!op) {
            if (s.remote && (!s.base || s.remote.version > s.base.version)) {
                conflict(s);
                await put(tx, s);
                continue;
            }
            if (s.base && isDeleted(s.base)) {
                if (s.deleted) await publish(tx, s, s.base);
                else {
                    conflict(s, "云端待办已删除，本地修改已保留");
                    await put(tx, s);
                }
                continue;
            }
            if (!s.base && s.deleted) {
                s.dirty = false;
                s.status = "synced";
                await put(tx, s);
                continue;
            }
            let request: TodoRequest;
            if (!s.base)
                request = {
                    kind: "create",
                    body: {
                        ...business(s.candidate),
                        client_id: s.clientId,
                        created_at: s.candidate.createdAt,
                    },
                };
            else if (s.deleted)
                request = {
                    kind: "delete",
                    id: s.base.id,
                    expected_version: s.base.version,
                };
            else {
                const next = business(s.candidate);
                const changed = Object.entries(next).filter(
                    ([key, value]) =>
                        s.base &&
                        !isDeleted(s.base) &&
                        s.base[key as keyof typeof next] !== value,
                );
                // Completion timestamp always participates in the patch so the server
                // arbitrates it, never silently dropped locally.
                const fields = Object.fromEntries(changed);
                if (fields.is_completed === true)
                    fields.completed_at = next.completed_at;
                if (!Object.keys(fields).length) {
                    await publish(tx, s, s.base);
                    continue;
                }
                const keys = Object.keys(fields);
                if (
                    keys.length === 1 &&
                    (keys[0] === "is_starred" || keys[0] === "is_pinned")
                )
                    request = {
                        kind:
                            keys[0] === "is_starred"
                                ? "set_starred"
                                : "set_pinned",
                        id: s.base.id,
                        expected_version: s.base.version,
                        value: fields[keys[0]] as boolean,
                    };
                else
                    request = {
                        kind: "patch",
                        id: s.base.id,
                        body: { ...fields, expected_version: s.base.version },
                    };
            }
            op = {
                owner_key: owner,
                client_id: s.clientId,
                operation_id: newTodoId(),
                sequence: s.sequence,
                request,
                request_json: JSON.stringify(request),
                attempts: 0,
                next_attempt_at: 0,
            };
            await tx.run(
                "INSERT INTO todo_outbox (owner_key,client_id,operation_id,sequence,request_json) VALUES (?,?,?,?,?)",
                [
                    owner,
                    s.clientId,
                    op.operation_id,
                    op.sequence,
                    JSON.stringify(request),
                ],
            );
        }
        if (op.next_attempt_at <= now) result.push(op);
    }
    return result;
}
async function assertOperation(tx: Tx, op: TodoOperation) {
    const current = await getOperation(tx, op.owner_key, op.client_id);
    if (current?.operation_id !== op.operation_id)
        throw new TodoError("conflict", "待办同步操作已变化");
    const s = await getSyncRecord(tx, op.owner_key, op.client_id);
    if (!s) throw new Error("待办同步记录不存在");
    return s;
}
export async function acceptOperation(
    tx: Tx,
    op: TodoOperation,
    remote: TodoRemote,
) {
    const s = await assertOperation(tx, op);
    s.remote = newest(s.remote, remote);
    s.base = remote;
    await tx.run(
        "DELETE FROM todo_outbox WHERE owner_key=? AND operation_id=?",
        [op.owner_key, op.operation_id],
    );
    if (s.sequence === op.sequence) await publish(tx, s, s.remote);
    else {
        s.dirty = true;
        s.status = "pending";
        s.error = null;
        if (
            s.remote.version > remote.version ||
            (isDeleted(s.remote) && !s.deleted)
        )
            conflict(s);
        await put(tx, s);
    }
}
export async function failOperation(
    tx: Tx,
    op: TodoOperation,
    message: string,
    retry: boolean,
    retryAt: number,
    remote: TodoRemote | null = null,
    asConflict = false,
) {
    const s = await assertOperation(tx, op);
    s.error = message;
    if (retry) {
        await tx.run(
            "UPDATE todo_outbox SET attempts=attempts+1,next_attempt_at=? WHERE owner_key=? AND operation_id=?",
            [retryAt, op.owner_key, op.operation_id],
        );
    } else {
        await tx.run(
            "DELETE FROM todo_outbox WHERE owner_key=? AND operation_id=?",
            [op.owner_key, op.operation_id],
        );
        if (remote) s.remote = newest(s.remote, remote);
        else if (asConflict) s.remote = null;
        s.status = asConflict ? "conflict" : "blocked";
    }
    await put(tx, s);
}
export async function readCursor(tx: Tx, owner: string) {
    return (
        await tx.getFirst<{ cursor: string }>(
            "SELECT cursor FROM todo_sync_cursors WHERE owner_key=?",
            [owner],
        )
    )?.cursor;
}
export async function saveCursor(tx: Tx, owner: string, cursor: string) {
    await tx.run(
        "INSERT INTO todo_sync_cursors VALUES (?,?) ON CONFLICT(owner_key) DO UPDATE SET cursor=excluded.cursor",
        [owner, cursor],
    );
}
export async function clearSnapshot(tx: Tx, owner: string) {
    await tx.run("DELETE FROM todo_snapshot_items WHERE owner_key=?", [owner]);
}
export async function stageSnapshot(
    tx: Tx,
    owner: string,
    remotes: TodoRemote[],
) {
    for (const remote of remotes)
        await tx.run("INSERT INTO todo_snapshot_items VALUES (?,?,?)", [
            owner,
            remote.client_id,
            JSON.stringify(remote),
        ]);
}
export async function finishSnapshot(
    tx: Tx,
    owner: string,
    cursor: string,
): Promise<number> {
    let changed = 0;
    const rows = await tx.getAll<{ payload_json: string }>(
        "SELECT payload_json FROM todo_snapshot_items WHERE owner_key=?",
        [owner],
    );
    const ids = new Set<string>();
    for (const row of rows) {
        const remote = JSON.parse(row.payload_json) as TodoRemote;
        ids.add(remote.client_id);
        if (await applyRemote(tx, owner, remote)) changed++;
    }
    for (const s of await listTodoSyncRecords(tx, owner, false)) {
        if (!s.base || isDeleted(s.base) || ids.has(s.clientId)) continue;
        // Missing from a COMPLETE snapshot is deletion evidence, not a fabricated server version.
        if (s.dirty || (await getOperation(tx, owner, s.clientId))) {
            if (!(await getOperation(tx, owner, s.clientId))) {
                s.remote = null;
                conflict(s, "完整云端快照中已无此待办，请接受删除或另存");
                await put(tx, s);
            }
        } else {
            await tx.run(
                "DELETE FROM local_todos WHERE owner_key=? AND client_id=?",
                [owner, s.clientId],
            );
            await tx.run(
                "DELETE FROM todo_sync_state WHERE owner_key=? AND client_id=?",
                [owner, s.clientId],
            );
            changed++;
        }
    }
    await saveCursor(tx, owner, cursor);
    await clearSnapshot(tx, owner);
    return changed;
}
export async function resolveTodoConflict(
    tx: Tx,
    owner: string,
    id: string,
    expectedSequence: number,
    expectedRemote: string,
    choice: "cloud" | "local" | "copy",
) {
    const s = await getSyncRecord(tx, owner, id);
    if (
        !s ||
        s.status !== "conflict" ||
        s.sequence !== expectedSequence ||
        JSON.stringify(s.remote) !== expectedRemote ||
        (await getOperation(tx, owner, id))
    )
        throw new TodoError(
            "conflict",
            "待办或云端版本已变化，请重新打开冲突处理",
        );
    const candidate = s.candidate;
    if (choice === "local") {
        if (!s.remote || isDeleted(s.remote))
            throw new Error("云端待办已删除，请另存为新待办");
        s.base = s.remote;
        s.sequence++;
        s.status = "pending";
        s.error = null;
        s.dirty = true;
        await put(tx, s);
        return;
    }
    if (s.remote) await publish(tx, s, s.remote);
    else {
        await tx.run(
            "DELETE FROM local_todos WHERE owner_key=? AND client_id=?",
            [owner, id],
        );
        s.deleted = true;
        s.dirty = false;
        s.status = "synced";
        s.error = null;
        await put(tx, s);
    }
    if (choice === "copy") {
        const copy = {
            ...candidate,
            clientId: newTodoId(),
            localVersion: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await writeLocal(tx, copy);
        await recordTodoChanges(tx, owner, [], [copy]);
    }
}
