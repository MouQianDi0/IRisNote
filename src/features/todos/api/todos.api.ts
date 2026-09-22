import api from "@/shared/http/client";
import { isAxiosError } from "axios";
import { newTodoId } from "../services/todo-service";
import {
    TodoApiError,
    isDeleted,
    type TodoRemote,
    type TodoSnapshotPage,
    type TodoChangesPage,
    type TodoOperation,
    type TodoWriteResult,
    type TodoBatchResult,
} from "../sync.types";
import {
    activeRemote,
    boolean,
    invalid,
    object,
    text,
    validateRemote,
} from "./todo-wire";

export interface TodoTransport {
    snapshot(cursor?: string, token?: string): Promise<TodoSnapshotPage>;
    changes(cursor: string): Promise<TodoChangesPage>;
    byClientId(clientId: string): Promise<TodoRemote>;
    write(operation: TodoOperation): Promise<TodoWriteResult>;
    batch(operations: TodoOperation[]): Promise<TodoBatchResult>;
}
const retryMilliseconds = (value: unknown) => {
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const seconds = Number(value);
    return Number.isFinite(seconds)
        ? Math.max(0, seconds * 1000)
        : Math.max(0, Date.parse(String(value)) - Date.now()) || 0;
};
type TodoHttpResponse = { data: unknown; requestId: string | null };
const responseRequestId = (headers: unknown): string | null => {
    if (!headers || typeof headers !== "object") return null;
    const source = headers as {
        get?: (name: string) => unknown;
        [key: string]: unknown;
    };
    const value =
        typeof source.get === "function"
            ? source.get("x-request-id")
            : source["x-request-id"];
    return typeof value === "string" && value.length > 0 && value.length <= 128
        ? value
        : null;
};
const requiredRequestId = (response: TodoHttpResponse) => {
    if (!response.requestId) throw invalid();
    return response.requestId;
};

/** Capture credentials once. An old owner's queued request never reads a new owner's token. */
export function createTodoTransport(
    userId: number,
    token: string,
    signal: AbortSignal,
): TodoTransport {
    const config = {
        signal,
        timeout: 15000,
        headers: { Authorization: `Bearer ${token}` },
    };
    async function request(
        task: () => Promise<{ data: unknown; headers: unknown }>,
        clientId?: string,
        id?: number,
    ): Promise<TodoHttpResponse> {
        try {
            const response = await task();
            return {
                data: response.data,
                requestId: responseRequestId(response.headers),
            };
        } catch (error) {
            if (signal.aborted) throw error;
            if (!isAxiosError(error)) throw error;
            const status = error.response?.status ?? 0;
            let code =
                status === 401 ? "UNAUTHENTICATED" : "TEMPORARILY_UNAVAILABLE";
            let current: TodoRemote | null = null;
            let requestId = responseRequestId(error.response?.headers);
            const raw: unknown = error.response?.data;
            if (raw && typeof raw === "object" && !Array.isArray(raw)) {
                const body = object(raw);
                if (body.error && typeof body.error === "object") {
                    const detail = object(body.error);
                    if (typeof detail.code === "string") code = detail.code;
                    if (
                        !requestId &&
                        typeof detail.request_id === "string" &&
                        detail.request_id.length > 0 &&
                        detail.request_id.length <= 128
                    )
                        requestId = detail.request_id;
                }
                if (body.current !== undefined) {
                    current = validateRemote(
                        body.current,
                        userId,
                        clientId,
                        id,
                    );
                    // current_version may be absent on some server error paths; only validate when present.
                    if (
                        isDeleted(current) ||
                        (body.current_version !== undefined &&
                            body.current_version !== current.version)
                    )
                        throw invalid();
                } else if (code === "TODO_DELETED" && body.data !== undefined) {
                    current = validateRemote(body.data, userId, clientId, id);
                    if (!isDeleted(current)) throw invalid();
                }
            }
            throw new TodoApiError(
                status,
                code,
                status === 401
                    ? "登录已失效，请重新登录后同步"
                    : code === "VERSION_CONFLICT"
                      ? "云端版本已变化，本地内容已保留"
                      : code === "TODO_DELETED"
                        ? "云端待办已删除，本地修改已保留"
                        : status === 422
                          ? "待办内容未通过云端校验，请编辑后重试"
                          : "待办同步未完成，本地内容已保留",
                retryMilliseconds(error.response?.headers["retry-after"]),
                current,
                requestId,
            );
        }
    }
    return {
        async snapshot(cursor, snapshotToken) {
            const response = await request(() =>
                api.get("/todos", {
                    ...config,
                    params: {
                        limit: 100,
                        ...(cursor
                            ? { cursor, snapshot_token: snapshotToken }
                            : {}),
                    },
                }),
            );
            const root = object(response.data);
            if (!Array.isArray(root.data)) throw invalid();
            const page = object(root.page);
            const sync = object(root.sync);
            const hasMore = boolean(page.has_more);
            const next =
                page.next_cursor === null ? null : text(page.next_cursor);
            if (hasMore && !next) throw invalid();
            return {
                data: root.data.map((item) => activeRemote(item, userId)),
                page: {
                    has_more: hasMore,
                    next_cursor: next,
                    snapshot_token: text(page.snapshot_token),
                },
                sync: { changes_cursor: text(sync.changes_cursor) },
            };
        },
        async changes(cursor) {
            const response = await request(() =>
                api.get("/todos/changes", {
                    ...config,
                    params: { cursor, limit: 100 },
                }),
            );
            const root = object(response.data);
            if (!Array.isArray(root.data)) throw invalid();
            const page = object(root.page);
            let previous = "0";
            const data: TodoChangesPage["data"] = root.data.map((value) => {
                const item = object(value);
                const seq = text(item.change_seq);
                if (!/^[1-9]\d*$/.test(seq) || BigInt(seq) <= BigInt(previous))
                    throw invalid();
                previous = seq;
                if (item.operation === "upsert")
                    return {
                        change_seq: seq,
                        operation: "upsert",
                        data: activeRemote(item.data, userId),
                    };
                if (item.operation !== "delete") throw invalid();
                const deleted = validateRemote(item, userId);
                if (!isDeleted(deleted)) throw invalid();
                return { ...deleted, change_seq: seq, operation: "delete" };
            });
            return {
                data,
                page: {
                    has_more: boolean(page.has_more),
                    next_cursor: text(page.next_cursor),
                },
            };
        },
        async byClientId(clientId) {
            const response = await request(
                () =>
                    api.get("/todos", {
                        ...config,
                        params: { client_id: clientId },
                    }),
                clientId,
            );
            const root = object(response.data);
            return validateRemote(root.data, userId, clientId);
        },
        async write(operation) {
            const req = operation.request;
            if (req.kind !== "create" && req.kind !== "patch") throw invalid();
            const options = {
                ...config,
                headers: {
                    ...config.headers,
                    "Idempotency-Key": operation.operation_id,
                },
            };
            const response = await request(
                () =>
                    req.kind === "create"
                        ? api.post("/todos", req.body, options)
                        : api.patch(`/todos/${req.id}`, req.body, options),
                operation.client_id,
                req.kind === "patch" ? req.id : undefined,
            );
            const root = object(response.data);
            const meta = object(root.meta);
            if (meta.operation_id !== operation.operation_id) throw invalid();
            const remote = validateRemote(
                root.data,
                userId,
                operation.client_id,
                req.kind === "patch" ? req.id : undefined,
            );
            if (
                isDeleted(remote) ||
                (req.kind === "patch" &&
                    remote.version < req.body.expected_version)
            )
                throw invalid();
            const requestId = requiredRequestId(response);
            const replayed = boolean(meta.replayed);
            const changed = boolean(meta.changed);
            if (__DEV__)
                console.info("[TodoSync] server acknowledged write", {
                    request_id: requestId,
                    operation_id: operation.operation_id,
                    kind: req.kind,
                    replayed,
                    changed,
                });
            return {
                data: remote,
                meta: {
                    request_id: requestId,
                    operation_id: operation.operation_id,
                    replayed,
                    changed,
                },
            };
        },
        async batch(operations) {
            const first = operations[0]?.request;
            if (
                !first ||
                first.kind === "create" ||
                first.kind === "patch" ||
                !operations.length ||
                operations.length > 100
            )
                throw invalid();
            const action = first.kind;
            const items = operations.map((op) => {
                const req = op.request;
                if (
                    req.kind === "create" ||
                    req.kind === "patch" ||
                    req.kind !== action ||
                    req.value !== first.value
                )
                    throw invalid();
                return {
                    id: req.id,
                    expected_version: req.expected_version,
                    operation_id: op.operation_id,
                };
            });
            // Each retry uses a new envelope and the same immutable per-item operation identities.
            const key = newTodoId();
            const response = await request(() =>
                api.post(
                    "/todos/batch",
                    {
                        action,
                        items,
                        ...(action === "delete" ? {} : { value: first.value }),
                    },
                    {
                        ...config,
                        headers: { ...config.headers, "Idempotency-Key": key },
                    },
                ),
            );
            const root = object(response.data);
            if (
                !Array.isArray(root.results) ||
                root.results.length !== items.length ||
                object(root.meta).operation_id !== key
            )
                throw invalid();
            const results: TodoBatchResult["results"] = root.results.map(
                (value, index) => {
                    const result = object(value);
                    const item = items[index];
                    const op = operations[index];
                    if (
                        result.operation_id !== item.operation_id ||
                        result.id !== item.id
                    )
                        throw invalid();
                    const common = {
                        operation_id: item.operation_id,
                        id: item.id,
                        changed: boolean(result.changed),
                    };
                    if (result.status === "succeeded") {
                        const data = validateRemote(
                            result.data,
                            userId,
                            op.client_id,
                            item.id,
                        );
                        if (
                            (action === "delete") !== isDeleted(data) ||
                            data.version < item.expected_version
                        )
                            throw invalid();
                        return { ...common, status: "succeeded", data };
                    }
                    if (result.status !== "failed") throw invalid();
                    const detail = object(result.error);
                    const current =
                        result.current === undefined
                            ? undefined
                            : activeRemote(result.current, userId);
                    const data =
                        result.data === undefined
                            ? undefined
                            : validateRemote(
                                  result.data,
                                  userId,
                                  op.client_id,
                                  item.id,
                              );
                    if (
                        current &&
                        (current.id !== item.id ||
                            current.client_id !== op.client_id ||
                            // current_version may be absent on some server error paths; only validate when present.
                            (result.current_version !== undefined &&
                                current.version !== result.current_version))
                    )
                        throw invalid();
                    if (data && !isDeleted(data)) throw invalid();
                    return {
                        ...common,
                        status: "failed",
                        error: {
                            code: text(detail.code),
                            message: "待办未同步，本地修改已保留",
                        },
                        retryable: boolean(result.retryable),
                        retry_after:
                            retryMilliseconds(result.retry_after) / 1000,
                        current,
                        current_version: current?.version,
                        data,
                    };
                },
            );
            const responseMeta = object(root.meta);
            const requestId = requiredRequestId(response);
            const replayed = boolean(responseMeta.replayed);
            if (__DEV__)
                console.info("[TodoSync] server acknowledged batch", {
                    request_id: requestId,
                    operation_id: key,
                    succeeded: results.filter(
                        (item) => item.status === "succeeded",
                    ).length,
                    failed: results.filter((item) => item.status === "failed")
                        .length,
                });
            return {
                meta: {
                    request_id: requestId,
                    operation_id: key,
                    replayed,
                },
                results,
            };
        },
    };
}
