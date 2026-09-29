import type { ApplicationDatabase } from "@/core/database/database.types";
import { hashExcerptContent, prepareExcerptContent } from "../domain/excerpt-validation";
import { ExcerptError } from "../excerpts.types";
import { newExcerptId } from "../services/excerpt-service";

type StashRow = {
    owner_key: string;
    client_id: string;
    content: string;
    content_hash: string;
    local_order: number;
    created_at: string;
};
export type ExcerptStashItem = {
    ownerKey: string;
    clientId: string;
    content: string;
    contentHash: string;
    localOrder: number;
    createdAt: string;
};
const fromRow = (row: StashRow): ExcerptStashItem => ({
    ownerKey: row.owner_key,
    clientId: row.client_id,
    content: row.content,
    contentHash: row.content_hash,
    localOrder: row.local_order,
    createdAt: row.created_at,
});

/** 每次操作以当前摘录仓库代次作为账号租约；SQLite 是唯一事实源。 */
export class ExcerptStashRepository {
    constructor(
        private readonly database: ApplicationDatabase,
        private readonly scope: { generation: number; assertSession: (ownerKey: string, generation: number) => void },
    ) {}

    private async checked<T>(ownerKey: string, task: () => Promise<T>): Promise<T> {
        const generation = this.scope.generation;
        this.scope.assertSession(ownerKey, generation);
        const result = await task();
        this.scope.assertSession(ownerKey, generation);
        return result;
    }

    list(ownerKey: string): Promise<ExcerptStashItem[]> {
        return this.checked(ownerKey, async () =>
            (await this.database.getAll<StashRow>(
                "SELECT owner_key, client_id, content, content_hash, local_order, created_at FROM local_excerpt_stash WHERE owner_key = ? ORDER BY local_order ASC, created_at ASC, client_id ASC",
                [ownerKey],
            )).map(fromRow),
        );
    }

    async hashes(ownerKey: string): Promise<Set<string>> {
        return new Set((await this.list(ownerKey)).map((item) => item.contentHash));
    }

    add(ownerKey: string, text: string): Promise<"added" | "duplicate"> {
        const content = prepareExcerptContent(text);
        const hash = hashExcerptContent(content);
        return this.checked(ownerKey, () => this.database.transaction(async (tx) => {
            const existing = await tx.getFirst<{ client_id: string }>(
                "SELECT client_id FROM local_excerpt_stash WHERE owner_key = ? AND content_hash = ?", [ownerKey, hash],
            );
            if (existing) return "duplicate";
            const order = await tx.getFirst<{ next_order: number }>(
                "SELECT COALESCE(MAX(local_order), -1) + 1 AS next_order FROM local_excerpt_stash WHERE owner_key = ?", [ownerKey],
            );
            const inserted = await tx.run(
                "INSERT OR IGNORE INTO local_excerpt_stash (owner_key, client_id, content, content_hash, local_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [ownerKey, newExcerptId(), content, hash, order?.next_order ?? 0, new Date().toISOString()],
            );
            return inserted.changes === 1 ? "added" : "duplicate";
        }));
    }

    move(ownerKey: string, clientId: string, direction: "up" | "down"): Promise<void> {
        return this.checked(ownerKey, () => this.database.transaction(async (tx) => {
            const rows = await tx.getAll<StashRow>(
                "SELECT owner_key, client_id, content, content_hash, local_order, created_at FROM local_excerpt_stash WHERE owner_key = ? ORDER BY local_order ASC, created_at ASC, client_id ASC", [ownerKey],
            );
            const index = rows.findIndex((item) => item.client_id === clientId);
            if (index < 0) throw new ExcerptError("missing", "该暂存内容已被删除");
            const adjacent = rows[index + (direction === "up" ? -1 : 1)];
            if (!adjacent) return;
            await tx.run("UPDATE local_excerpt_stash SET local_order = ? WHERE owner_key = ? AND client_id = ?", [adjacent.local_order, ownerKey, clientId]);
            await tx.run("UPDATE local_excerpt_stash SET local_order = ? WHERE owner_key = ? AND client_id = ?", [rows[index].local_order, ownerKey, adjacent.client_id]);
        }));
    }

    update(ownerKey: string, clientId: string, text: string): Promise<"saved" | "duplicate"> {
        const content = prepareExcerptContent(text);
        const hash = hashExcerptContent(content);
        return this.checked(ownerKey, () => this.database.transaction(async (tx) => {
            const duplicate = await tx.getFirst<{ client_id: string }>(
                "SELECT client_id FROM local_excerpt_stash WHERE owner_key = ? AND content_hash = ? AND client_id <> ?", [ownerKey, hash, clientId],
            );
            if (duplicate) return "duplicate";
            const result = await tx.run(
                "UPDATE OR IGNORE local_excerpt_stash SET content = ?, content_hash = ? WHERE owner_key = ? AND client_id = ?", [content, hash, ownerKey, clientId],
            );
            if (result.changes !== 1) {
                const current = await tx.getFirst<{ client_id: string }>(
                    "SELECT client_id FROM local_excerpt_stash WHERE owner_key = ? AND client_id = ?", [ownerKey, clientId],
                );
                if (current) return "duplicate";
                throw new ExcerptError("missing", "该暂存内容已被删除");
            }
            return "saved";
        }));
    }

    remove(ownerKey: string, clientId: string): Promise<void> {
        return this.checked(ownerKey, async () => {
            await this.database.run("DELETE FROM local_excerpt_stash WHERE owner_key = ? AND client_id = ?", [ownerKey, clientId]);
        });
    }

    clear(ownerKey: string): Promise<void> {
        return this.checked(ownerKey, async () => {
            await this.database.run("DELETE FROM local_excerpt_stash WHERE owner_key = ?", [ownerKey]);
        });
    }
}
