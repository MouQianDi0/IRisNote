import type { DatabaseMigration } from "../database.types";

type BackfillNoteRow = {
    owner_user_id: number;
    client_id: number;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
};

// 迁移属于 core，不能依赖 Feature 代码；ID 生成与会话 ID 使用同一风格。
let migrationRevisionCounter = 0;
const newMigrationRevisionId = () => {
    migrationRevisionCounter += 1;
    return `${Date.now().toString(36)}-${migrationRevisionCounter.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
};

export const createNoteRevisions: DatabaseMigration = {
    version: 4,
    name: "create_note_revisions",
    async up(database) {
        // 版本是本地历史；删除笔记时由仓库事务显式清理，不使用外键级联。
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS note_revisions (
                revision_id TEXT PRIMARY KEY,
                owner_user_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                parent_revision_id TEXT,
                title TEXT NOT NULL,
                content TEXT,
                category_id INTEGER,
                origin TEXT NOT NULL CHECK (
                    origin IN ('local-save', 'server-reconcile', 'restore', 'migrate')
                ),
                created_at TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_note_revisions_note
                ON note_revisions (owner_user_id, client_id, created_at DESC);
        `);

        // 与 0003 的可重复执行约定一致：重复执行只补缺失的列。
        const localColumns = await database.getAllAsync<{ name: string }>(
            "PRAGMA table_info(local_notes)",
        );
        if (
            !localColumns.some(
                (column) => column.name === "current_revision_id",
            )
        ) {
            await database.execAsync(
                "ALTER TABLE local_notes ADD COLUMN current_revision_id TEXT",
            );
        }
        const draftColumns = await database.getAllAsync<{ name: string }>(
            "PRAGMA table_info(note_drafts)",
        );
        if (
            !draftColumns.some((column) => column.name === "base_revision_id")
        ) {
            await database.execAsync(
                "ALTER TABLE note_drafts ADD COLUMN base_revision_id TEXT",
            );
        }

        // 存量回填：尚无版本指针的笔记用当前内容生成初始版本（origin=migrate）。
        const rows = await database.getAllAsync<BackfillNoteRow>(
            `SELECT owner_user_id, client_id, title, content, category_id, created_at
             FROM local_notes
             WHERE current_revision_id IS NULL`,
        );
        for (const row of rows) {
            const revisionId = newMigrationRevisionId();
            await database.runAsync(
                `INSERT INTO note_revisions (
                    revision_id, owner_user_id, client_id, parent_revision_id,
                    title, content, category_id, origin, created_at, schema_version
                 ) VALUES (
                    $revisionId, $ownerUserId, $clientId, NULL,
                    $title, $content, $categoryId, 'migrate', $createdAt, 1
                 )`,
                {
                    $revisionId: revisionId,
                    $ownerUserId: row.owner_user_id,
                    $clientId: row.client_id,
                    $title: row.title,
                    $content: row.content,
                    $categoryId: row.category_id,
                    $createdAt: row.created_at,
                },
            );
            await database.runAsync(
                `UPDATE local_notes
                 SET current_revision_id = $revisionId
                 WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
                {
                    $revisionId: revisionId,
                    $ownerUserId: row.owner_user_id,
                    $clientId: row.client_id,
                },
            );
        }

        // 仅补齐缺失的基础版本；不覆盖已有值，避免重置过期草稿的冲突判定。
        await database.runAsync(
            `UPDATE note_drafts
             SET base_revision_id = (
                SELECT local_notes.current_revision_id
                FROM local_notes
                WHERE local_notes.owner_user_id = note_drafts.owner_user_id
                  AND local_notes.client_id = note_drafts.note_id
             )
             WHERE note_id IS NOT NULL AND base_revision_id IS NULL`,
        );
    },
};
