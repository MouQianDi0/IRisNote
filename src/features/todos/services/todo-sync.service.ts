import type { TodoLocalRepository } from "../data/todo-local.repository";
import {
  acceptOperation,
  applyRemote,
  clearSnapshot,
  enlistExisting,
  failOperation,
  finishSnapshot,
  prepareOperations,
  readCursor,
  saveCursor,
  stageSnapshot,
  listTodoSyncRecords,
} from "../data/todo-sync.repository";
import type { TodoTransport } from "../api/todos.api";
import { business } from "../api/todo-wire";
import {
  TodoApiError,
  isDeleted,
  type TodoOperation,
  type TodoRemote,
} from "../sync.types";
import { notifyTodoSyncChanged } from "../state/todo-sync-events";

export type TodoSyncSession = {
  repository: TodoLocalRepository;
  ownerKey: string;
  transport: TodoTransport;
  isCurrent: () => boolean;
};
export type TodoSyncResult = {
  pending: number;
  uploaded: number;
  downloaded: number;
  changed: number;
};
export async function syncTodos(
  session: TodoSyncSession,
): Promise<TodoSyncResult> {
  const { repository, ownerKey, transport } = session;
  let uploaded = 0;
  let downloaded = 0;
  const check = () => {
    if (!session.isCurrent()) throw new Error("待办同步会话已结束");
  };
  const transaction: TodoLocalRepository["syncTransaction"] = (owner, task) => {
    check();
    return repository.syncTransaction(owner, async (tx) => {
      check();
      const result = await task(tx);
      check();
      return result;
    });
  };
  await transaction(ownerKey, (tx) =>
    enlistExisting(tx, ownerKey, repository.list(ownerKey)),
  );
  const ops = await transaction(ownerKey, (tx) =>
    prepareOperations(tx, ownerKey, Date.now()),
  );
  async function reportResult(): Promise<TodoSyncResult> {
    const records = await transaction(ownerKey, (tx) =>
      listTodoSyncRecords(tx, ownerKey),
    );
    return {
      pending: records.length,
      uploaded,
      downloaded,
      changed: uploaded + downloaded,
    };
  }
  async function accepted(op: TodoOperation, remote: TodoRemote) {
    check();
    await transaction(ownerKey, (tx) => acceptOperation(tx, op, remote));
  }
  async function failed(op: TodoOperation, cause: unknown) {
    check();
    const error =
      cause instanceof TodoApiError
        ? cause
        : new TodoApiError(
            0,
            "NETWORK_ERROR",
            "待办同步连接中断，本地内容已保留",
          );
    if (op.request.kind === "create" && error.code === "CLIENT_ID_EXISTS") {
      try {
        const existing = await transport.byClientId(op.client_id);
        check();
        if (
          !isDeleted(existing) &&
          Object.entries(op.request.body).every(
            ([key, value]) => existing[key as keyof typeof existing] === value,
          )
        ) {
          await accepted(op, existing);
          return;
        }
        await transaction(ownerKey, (tx) =>
          failOperation(
            tx,
            op,
            "云端已有同一待办，请选择保留的内容",
            false,
            0,
            existing,
            true,
          ),
        );
        return;
      } catch (recovery) {
        check();
        if (
          recovery instanceof TodoApiError &&
          recovery.code === "TODO_DELETED" &&
          recovery.current
        ) {
          await transaction(ownerKey, (tx) =>
            failOperation(
              tx,
              op,
              "云端待办已删除，本地内容已保留",
              false,
              0,
              recovery.current,
              true,
            ),
          );
          return;
        }
        // Recovery failure does not establish absence, so retain the immutable create request.
        await transaction(ownerKey, (tx) =>
          failOperation(
            tx,
            op,
            "正在恢复创建结果，本地内容已保留",
            true,
            Date.now() + 30000,
          ),
        );
        if (recovery instanceof TodoApiError && recovery.status === 401)
          throw recovery;
        return;
      }
    }
    if (
      error.code === "TODO_DELETED" &&
      error.current &&
      op.request.kind === "delete"
    ) {
      await accepted(op, error.current);
      return;
    }
    const retry =
      error.status === 0 ||
      error.status === 401 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500 ||
      error.code === "OPERATION_IN_PROGRESS";
    const isConflict =
      (!!error.current &&
        ["VERSION_CONFLICT", "TODO_DELETED"].includes(error.code)) ||
      (error.code === "TODO_NOT_FOUND" && op.request.kind !== "create");
    await transaction(ownerKey, (tx) =>
      failOperation(
        tx,
        op,
        error.message,
        retry,
        Date.now() +
          Math.max(
            error.retryAfter,
            Math.min(300000, 1000 * 2 ** Math.min(op.attempts, 9)),
          ),
        error.current,
        isConflict,
      ),
    );
    if (error.status === 401) throw error;
  }
  try {
    const remaining = [...ops];
    while (remaining.length) {
      check();
      const op = remaining.shift()!;
      if (op.request.kind === "create" || op.request.kind === "patch") {
        try {
          const reply = await transport.write(op);
          await accepted(op, reply.data);
          uploaded++;
        } catch (error) {
          await failed(op, error);
        }
      } else {
        const request = op.request;
        const group = [op];
        for (let i = 0; i < remaining.length && group.length < 100;) {
          const other = remaining[i].request;
          if (
            other.kind !== "create" &&
            other.kind !== "patch" &&
            other.kind === request.kind &&
            other.value === request.value
          )
            group.push(remaining.splice(i, 1)[0]);
          else i++;
        }
        let result;
        try {
          result = await transport.batch(group);
          check();
        } catch (error) {
          for (const item of group) await failed(item, error);
          continue;
        }
        for (let i = 0; i < group.length; i++) {
          const item = result.results[i];
          if (item.status === "succeeded") {
            await accepted(group[i], item.data);
            uploaded++;
          }
          else
            await failed(
              group[i],
              new TodoApiError(
                item.retryable
                  ? 503
                  : item.error.code === "TODO_NOT_FOUND"
                    ? 404
                    : 409,
                item.error.code,
                item.error.message,
                (item.retry_after ?? 0) * 1000,
                item.current ?? item.data ?? null,
              ),
            );
        }
      }
    }
    let cursor = await transaction(ownerKey, (tx) => readCursor(tx, ownerKey));
    if (cursor) {
      try {
        const visited = new Set<string>();
        while (true) {
          check();
          if (visited.has(cursor)) throw new Error("待办增量游标未前进");
          visited.add(cursor);
          const page = await transport.changes(cursor);
          check();
          const applied = await transaction(ownerKey, async (tx) => {
            let changed = 0;
            for (const event of page.data)
              if (await applyRemote(
                tx,
                ownerKey,
                event.operation === "upsert" ? event.data : event,
              ))
                changed++;
            await saveCursor(tx, ownerKey, page.page.next_cursor);
            return changed;
          });
          downloaded += applied;
          cursor = page.page.next_cursor;
          if (!page.page.has_more) break;
        }
        return await reportResult();
      } catch (error) {
        if (
          !(error instanceof TodoApiError) ||
          !["INVALID_CURSOR", "SYNC_CURSOR_EXPIRED"].includes(error.code)
        )
          throw error;
      }
    }
    await transaction(ownerKey, (tx) => clearSnapshot(tx, ownerKey));
    let next: string | undefined;
    let token: string | undefined;
    let baseline: string | undefined;
    const visited = new Set<string>();
    while (true) {
      check();
      const page = await transport.snapshot(next, token);
      check();
      if (
        (token && token !== page.page.snapshot_token) ||
        (baseline && baseline !== page.sync.changes_cursor)
      )
        throw new Error("待办快照已变化，请重新同步");
      token = page.page.snapshot_token;
      baseline = page.sync.changes_cursor;
      await transaction(ownerKey, (tx) =>
        stageSnapshot(tx, ownerKey, page.data),
      );
      if (!page.page.has_more) {
        downloaded += await transaction(ownerKey, (tx) =>
          finishSnapshot(tx, ownerKey, page.sync.changes_cursor),
        );
        break;
      }
      const value = page.page.next_cursor;
      if (!value || visited.has(value)) throw new Error("待办快照分页未前进");
      visited.add(value);
      next = value;
    }
    return await reportResult();
  } finally {
    if (session.isCurrent()) notifyTodoSyncChanged();
  }
}

/** Useful for deterministic protocol tests without network or native dependencies. */
export { business as todoBusinessPayload };
