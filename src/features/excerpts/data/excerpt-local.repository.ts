import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction,
} from "@/core/database/database.types";
import {
    compareExcerpts,
    hashExcerptContent,
    prepareExcerptContent,
} from "../domain/excerpt-validation";
import {
    ExcerptError,
    type ExcerptEntity,
    type ExcerptPatch,
    type ExcerptSaveReceipt,
    type ExcerptSource,
} from "../excerpts.types";

/** 与待办一致：未登录时摘录归入本机访客空间，登录后按账号隔离，不自动合并。 */
export const EXCERPT_GUEST_OWNER_KEY = "guest:local";

const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCES: readonly ExcerptSource[] = ["paste", "auto", "manual"];

export type ExcerptRow = {
    owner_key: string;
    client_id: string;
    content: string;
    content_hash: string;
    source: ExcerptSource;
    is_pinned: number;
    local_version: number;
    created_at: string;
    updated_at: string;
};

const columns =
    "owner_key, client_id, content, content_hash, source, is_pinned, local_version, created_at, updated_at";

export function excerptFromRow(row: ExcerptRow): ExcerptEntity {
    if (
        !row.owner_key ||
        !UUID_PATTERN.test(row.client_id) ||
        !row.content ||
        !/^[0-9a-f]{64}$/.test(row.content_hash) ||
        !SOURCES.includes(row.source) ||
        (row.is_pinned !== 0 && row.is_pinned !== 1) ||
        !Number.isSafeInteger(row.local_version) ||
        row.local_version < 1 ||
        [row.created_at, row.updated_at].some(
            (value) => !Number.isFinite(Date.parse(value)),
        )
    )
        throw new Error("摘录存储数据无效");
    return Object.freeze({
        ownerKey: row.owner_key,
        clientId: row.client_id,
        content: row.content,
        contentHash: row.content_hash,
        source: row.source,
        isPinned: row.is_pinned === 1,
        localVersion: row.local_version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });
}

async function readOwner(
    database: ApplicationDatabaseTransaction,
    ownerKey: string,
) {
    const rows = await database.getAll<ExcerptRow>(
        `SELECT ${columns} FROM local_excerpts WHERE owner_key = ?`,
        [ownerKey],
    );
    return rows.map(excerptFromRow).sort(compareExcerpts);
}

/** 版本不匹配时区分「已被删除」和「已被修改」，便于界面给出准确提示。 */
async function assertChanged(
    transaction: ApplicationDatabaseTransaction,
    changes: number,
    base: ExcerptEntity,
) {
    if (changes === 1) return;
    const current = await transaction.getFirst<{ local_version: number }>(
        "SELECT local_version FROM local_excerpts WHERE owner_key = ? AND client_id = ?",
        [base.ownerKey, base.clientId],
    );
    throw current
        ? new ExcerptError("conflict", "摘录已变化，请重试")
        : new ExcerptError("missing", "该摘录已被删除");
}

async function writeVersion(
    transaction: ApplicationDatabaseTransaction,
    base: ExcerptEntity,
    next: ExcerptEntity,
) {
    const result = await transaction.run(
        `UPDATE local_excerpts
         SET content = ?, content_hash = ?, is_pinned = ?, local_version = ?, updated_at = ?
         WHERE owner_key = ? AND client_id = ? AND local_version = ?`,
        [
            next.content,
            next.contentHash,
            Number(next.isPinned),
            next.localVersion,
            next.updatedAt,
            base.ownerKey,
            base.clientId,
            base.localVersion,
        ],
    );
    await assertChanged(transaction, result.changes, base);
}

/** 「数据与存储」页用：某账号的摘录条数与正文字节数（UTF-8）。 */
export async function readExcerptStorageStats(
    database: ApplicationDatabaseTransaction,
    ownerKey: string,
): Promise<{ count: number; bytes: number }> {
    const row = await database.getFirst<{
        count: number;
        bytes: number | null;
    }>(
        "SELECT COUNT(*) AS count, SUM(length(CAST(content AS BLOB))) AS bytes FROM local_excerpts WHERE owner_key = ?",
        [ownerKey],
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
}

/** SQLite 为唯一事实来源；同步读取只暴露已提交的界面快照。 */
export class ExcerptLocalRepository {
    ownerKey: string | null = null;
    generation = 0;
    ready = false;
    private database: ApplicationDatabase | null;
    private entities: readonly ExcerptEntity[] = [];
    private listeners = new Set<() => void>();
    private queue: Promise<unknown> = Promise.resolve();
    private activation: Promise<void> | null = null;

    constructor(database: ApplicationDatabase | null = null) {
        this.database = database;
    }

    private enqueue<T>(task: () => Promise<T>): Promise<T> {
        const pending = this.queue.then(task);
        this.queue = pending.catch(() => undefined);
        return pending;
    }

    /** 等待调用时已排队的写入全部结束（成功或失败都算结束）。 */
    idle(): Promise<void> {
        return this.queue.then(() => undefined);
    }

    deactivate() {
        if (this.ownerKey === null) return;
        this.ownerKey = null;
        this.generation += 1;
        this.ready = false;
        this.entities = [];
        this.activation = null;
        this.broadcast();
    }

    activate(ownerKey: string, database = this.database): Promise<void> {
        if (!database || !ownerKey)
            return Promise.reject(new Error("摘录数据库未就绪"));
        if (this.ownerKey === ownerKey && this.database === database) {
            if (this.activation) return this.activation;
            if (this.ready) return Promise.resolve();
        }
        this.database = database;
        this.ownerKey = ownerKey;
        const generation = ++this.generation;
        this.ready = false;
        this.entities = [];
        this.broadcast();
        const pending = this.enqueue(async () => {
            this.assertSession(ownerKey, generation);
            const entities = await readOwner(database, ownerKey);
            this.assertSession(ownerKey, generation);
            this.entities = Object.freeze(entities);
            this.ready = true;
            this.broadcast();
        });
        this.activation = pending;
        const clear = () => {
            if (this.activation === pending) this.activation = null;
        };
        void pending.then(clear, clear);
        return pending;
    }

    assertSession(ownerKey: string, generation = this.generation) {
        if (
            !ownerKey ||
            this.ownerKey !== ownerKey ||
            this.generation !== generation
        )
            throw new ExcerptError("owner", "账号会话已失效，请重新打开摘录");
    }

    list(ownerKey: string): readonly ExcerptEntity[] {
        this.assertSession(ownerKey);
        return this.entities;
    }

    get(ownerKey: string, clientId: string): ExcerptEntity {
        this.assertSession(ownerKey);
        const entity = this.entities.find((item) => item.clientId === clientId);
        if (!entity) throw new ExcerptError("missing", "该摘录已被删除");
        return entity;
    }

    private mutate<T>(
        ownerKey: string,
        task: (transaction: ApplicationDatabaseTransaction) => Promise<T>,
    ): Promise<T> {
        const generation = this.generation;
        const database = this.database;
        try {
            this.assertSession(ownerKey, generation);
        } catch (error) {
            return Promise.reject(error);
        }
        if (!database || !this.ready)
            return Promise.reject(new Error("摘录尚未加载完成，请稍后重试"));
        // 会话只在受理时校验。已受理的写入固定写入调用时的账号与数据库：排队或提交期间
        // 切换账号（如退出登录）也照常完成，不回滚；新账号的读取排在它之后，不会交错。
        return this.enqueue(async () => {
            const committed = await database.transaction(
                async (transaction) => ({
                    result: await task(transaction),
                    entities: await readOwner(transaction, ownerKey),
                }),
            );
            // 切换账号后，旧账号的写入结果不得发布到新账号的界面。
            if (this.ownerKey === ownerKey && this.generation === generation)
                this.publish(committed.entities);
            return committed.result;
        });
    }

    private publish(next: readonly ExcerptEntity[]) {
        const cached = new Map(
            this.entities.map((entity) => [entity.clientId, entity]),
        );
        const entities = next.map((entity) => {
            const previous = cached.get(entity.clientId);
            return previous?.localVersion === entity.localVersion
                ? previous
                : entity;
        });
        if (
            entities.length === this.entities.length &&
            entities.every((entity, index) => entity === this.entities[index])
        )
            return;
        this.entities = Object.freeze(entities);
        this.broadcast();
    }

    /** 新建摘录；相同内容已存在时不新建，而是把原摘录移到最前。 */
    save(
        ownerKey: string,
        clientId: string,
        text: string,
        source: ExcerptSource,
        now: Date,
    ): Promise<ExcerptSaveReceipt> {
        let content: string;
        try {
            if (!UUID_PATTERN.test(clientId)) throw new Error("摘录标识无效");
            content = prepareExcerptContent(text);
        } catch (error) {
            return Promise.reject(error);
        }
        const contentHash = hashExcerptContent(content);
        const stamp = now.toISOString();
        return this.mutate(ownerKey, async (transaction) => {
            const existing = await transaction.getFirst<ExcerptRow>(
                `SELECT ${columns} FROM local_excerpts WHERE owner_key = ? AND content_hash = ?`,
                [ownerKey, contentHash],
            );
            if (existing) {
                const base = excerptFromRow(existing);
                const next = Object.freeze({
                    ...base,
                    localVersion: base.localVersion + 1,
                    updatedAt: stamp,
                });
                await writeVersion(transaction, base, next);
                return { entity: next, duplicated: true };
            }
            const entity: ExcerptEntity = Object.freeze({
                ownerKey,
                clientId,
                content,
                contentHash,
                source,
                isPinned: false,
                localVersion: 1,
                createdAt: stamp,
                updatedAt: stamp,
            });
            await transaction.run(
                `INSERT INTO local_excerpts (${columns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    entity.ownerKey,
                    entity.clientId,
                    entity.content,
                    entity.contentHash,
                    entity.source,
                    0,
                    entity.localVersion,
                    entity.createdAt,
                    entity.updatedAt,
                ],
            );
            return { entity, duplicated: false };
        });
    }

    /** 改正文会刷新更新时间；只切换置顶不改变「最近更新」排序依据。 */
    update(
        ownerKey: string,
        base: ExcerptEntity,
        patch: ExcerptPatch,
        now: Date,
    ): Promise<ExcerptEntity> {
        let content = base.content;
        try {
            if (patch.content !== undefined)
                content = prepareExcerptContent(patch.content);
        } catch (error) {
            return Promise.reject(error);
        }
        const isPinned = patch.isPinned ?? base.isPinned;
        const contentChanged = content !== base.content;
        if (!contentChanged && isPinned === base.isPinned)
            return Promise.resolve(base);
        const contentHash = contentChanged
            ? hashExcerptContent(content)
            : base.contentHash;
        const next: ExcerptEntity = Object.freeze({
            ...base,
            content,
            contentHash,
            isPinned,
            localVersion: base.localVersion + 1,
            updatedAt: contentChanged ? now.toISOString() : base.updatedAt,
        });
        return this.mutate(ownerKey, async (transaction) => {
            if (contentChanged) {
                const duplicate = await transaction.getFirst<{
                    client_id: string;
                }>(
                    "SELECT client_id FROM local_excerpts WHERE owner_key = ? AND content_hash = ? AND client_id <> ?",
                    [ownerKey, contentHash, base.clientId],
                );
                if (duplicate)
                    throw new ExcerptError("duplicate", "已有相同内容的摘录");
            }
            await writeVersion(transaction, base, next);
            return next;
        });
    }

    delete(ownerKey: string, base: ExcerptEntity): Promise<void> {
        return this.mutate(ownerKey, async (transaction) => {
            const result = await transaction.run(
                "DELETE FROM local_excerpts WHERE owner_key = ? AND client_id = ? AND local_version = ?",
                [ownerKey, base.clientId, base.localVersion],
            );
            await assertChanged(transaction, result.changes, base);
        });
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private broadcast() {
        for (const listener of this.listeners) listener();
    }
}
