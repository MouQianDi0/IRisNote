import type { DatabaseMigration } from "../database.types";

/**
 * 正文淘汰：已同步笔记超出保留范围后只留元数据与摘要，打开时再下载。
 * - `body_state`：present 正文在本机；evicted 已淘汰（content 为 NULL，content_hash 保留云端哈希）。
 * - `content_preview`、`content_length`：淘汰时取自云端元数据，供列表与回收站显示。
 * - `last_opened_at`：最近打开时间，淘汰时最久没打开的先淘汰。
 * 触发器：淘汰语句不清空哈希；已淘汰笔记被任何路径重新写入正文时，恢复为 present 并清空摘要与哈希。
 */
export const addNoteBodyState: DatabaseMigration = {
    version: 18,
    name: "add_note_body_state",
    async up(database) {
        const columns = new Set(
            (
                await database.getAllAsync<{ name: string }>(
                    "PRAGMA table_info(local_notes)",
                )
            ).map((column) => column.name),
        );
        const additions: [string, string][] = [
            [
                "body_state",
                "body_state TEXT NOT NULL DEFAULT 'present' CHECK (body_state IN ('present', 'evicted'))",
            ],
            ["content_preview", "content_preview TEXT"],
            ["content_length", "content_length INTEGER"],
            ["last_opened_at", "last_opened_at TEXT"],
        ];
        for (const [name, definition] of additions) {
            if (!columns.has(name))
                await database.execAsync(
                    `ALTER TABLE local_notes ADD COLUMN ${definition}`,
                );
        }
        await database.execAsync(`
            DROP TRIGGER IF EXISTS local_notes_content_hash_reset;
            CREATE TRIGGER local_notes_content_hash_reset
            AFTER UPDATE OF content ON local_notes
            WHEN NEW.content IS NOT OLD.content AND NEW.content_hash IS OLD.content_hash
                AND NEW.body_state = 'present'
            BEGIN
                UPDATE local_notes SET content_hash = NULL WHERE local_id = NEW.local_id;
            END;
            CREATE TRIGGER IF NOT EXISTS local_notes_body_restored
            AFTER UPDATE OF content ON local_notes
            WHEN OLD.body_state = 'evicted' AND NEW.body_state = 'evicted'
            BEGIN
                UPDATE local_notes
                SET body_state = 'present', content_preview = NULL, content_length = NULL, content_hash = NULL
                WHERE local_id = NEW.local_id;
            END;
        `);
    },
};
