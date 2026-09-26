import type { DatabaseMigration } from "../database.types";

/**
 * 阅读进度从 AsyncStorage 迁入 SQLite，按账号与笔记本地 ID 存放，便于随笔记永久删除一起清理。
 * 旧数据由运行时一次性搬迁（见 note-reading-progress.repository），迁移本身只建表，不读 AsyncStorage。
 */
export const createNoteReadingProgress: DatabaseMigration = {
    version: 15,
    name: "create_note_reading_progress",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS note_reading_progress (
                owner_user_id INTEGER NOT NULL,
                note_id INTEGER NOT NULL,
                record_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, note_id)
            );
        `);
    },
};
