import type { DatabaseMigration } from "../database.types";

/**
 * 元数据同步：本地正文哈希与镜像模式。
 * - `local_notes.content_hash`：正文 UTF-8 字节的 SHA-256，由同步在需要比较时补算。正文被任何路径改写时，
 *   触发器清空哈希，保证它要么与正文一致、要么为空，不依赖每个写入点单独维护。
 * - `note_sync_state.mirror_mode`：镜像保存完整笔记（full）还是只存元数据（meta）；快照令牌与模式绑定。
 */
export const addNoteContentHash: DatabaseMigration = {
    version: 17,
    name: "add_note_content_hash",
    async up(database) {
        const noteColumns = await database.getAllAsync<{ name: string }>(
            "PRAGMA table_info(local_notes)",
        );
        if (!noteColumns.some((column) => column.name === "content_hash")) {
            await database.execAsync(
                "ALTER TABLE local_notes ADD COLUMN content_hash TEXT",
            );
        }
        const stateColumns = await database.getAllAsync<{ name: string }>(
            "PRAGMA table_info(note_sync_state)",
        );
        if (!stateColumns.some((column) => column.name === "mirror_mode")) {
            await database.execAsync(
                "ALTER TABLE note_sync_state ADD COLUMN mirror_mode TEXT NOT NULL DEFAULT 'full' CHECK (mirror_mode IN ('full', 'meta'))",
            );
        }
        await database.execAsync(`
            CREATE TRIGGER IF NOT EXISTS local_notes_content_hash_reset
            AFTER UPDATE OF content ON local_notes
            WHEN NEW.content IS NOT OLD.content AND NEW.content_hash IS OLD.content_hash
            BEGIN
                UPDATE local_notes SET content_hash = NULL WHERE local_id = NEW.local_id;
            END;
        `);
    },
};
