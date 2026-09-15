import type { DatabaseMigration } from "../database.types";

export const createNoteDrafts: DatabaseMigration = {
    version: 3,
    name: "create_note_drafts",
    async up(database) {
        // 不级联删除：服务器列表合并移除笔记时，仍必须保留未提交草稿。
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS note_drafts (
                owner_user_id INTEGER NOT NULL,
                draft_key TEXT NOT NULL,
                session_id TEXT NOT NULL,
                note_id INTEGER,
                base_snapshot TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category_id INTEGER,
                sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
                updated_at TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, draft_key)
            );
        `);
    },
};
