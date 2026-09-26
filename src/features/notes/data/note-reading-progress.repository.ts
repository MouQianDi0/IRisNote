import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";
import type { ReadingStorage } from "../reading/reading-progress-store";

/** 与 ReadingProgressStore 的键格式一致；本地新建未同步的笔记 ID 为负数。 */
const KEY_PREFIX = "irisnote:reading:";
const KEY_PATTERN = /^irisnote:reading:([1-9]\d*):(-?[1-9]\d*)$/;

export type LegacyReadingStorage = {
    getAllKeys(): Promise<readonly string[]>;
    multiGet(
        keys: readonly string[],
    ): Promise<readonly (readonly [string, string | null])[]>;
    multiRemove(keys: readonly string[]): Promise<void>;
};

function parseKey(key: string) {
    const match = KEY_PATTERN.exec(key);
    if (!match) return null;
    const owner = Number(match[1]);
    const note = Number(match[2]);
    return Number.isSafeInteger(owner) && Number.isSafeInteger(note)
        ? { owner, note }
        : null;
}

const keyFor = (owner: number, note: number) => `${KEY_PREFIX}${owner}:${note}`;

/**
 * 旧版从不清理已删除笔记的进度键，搬迁前先排除确定已删除的笔记：
 * 有彻底删除标记；或是本地编号（负数，取自 rowid，删除后可能复用给新建笔记）
 * 且笔记表、回收站都没有——否则新笔记会继承旧进度。服务器编号不会复用，
 * 笔记可能只是被清理了本地缓存，照常搬迁。
 */
async function isDeletedNote(tx: Tx, owner: number, note: number) {
    if (
        await tx.getFirst(
            "SELECT 1 FROM note_trash_purged WHERE owner_user_id=? AND client_id=?",
            [owner, note],
        )
    )
        return true;
    return (
        note < 0 &&
        !(await tx.getFirst(
            `SELECT 1 FROM local_notes WHERE owner_user_id=? AND client_id=?
             UNION ALL SELECT 1 FROM note_trash WHERE owner_user_id=? AND client_id=? LIMIT 1`,
            [owner, note, owner, note],
        ))
    );
}

/**
 * 把旧版存在 AsyncStorage 的阅读进度搬进 SQLite。SQLite 已有的记录较新，不被覆盖；
 * 已删除笔记的旧键不搬、随其他旧键一起删除。写入事务提交后才删除旧键，
 * 中途失败时旧键保留，下次启动重试。返回处理（并已删除）的旧键数。
 */
export async function migrateLegacyReadingProgress(
    database: ApplicationDatabase,
    legacy: LegacyReadingStorage,
): Promise<number> {
    const keys = (await legacy.getAllKeys()).filter((key) => parseKey(key));
    if (!keys.length) return 0;
    const entries = await legacy.multiGet(keys);
    const now = new Date().toISOString();
    await database.transaction(async (tx) => {
        for (const [key, value] of entries) {
            const id = parseKey(key);
            if (!id || value === null) continue;
            if (await isDeletedNote(tx, id.owner, id.note)) continue;
            await tx.run(
                `INSERT OR IGNORE INTO note_reading_progress
                 (owner_user_id, note_id, record_json, updated_at) VALUES (?, ?, ?, ?)`,
                [id.owner, id.note, value, now],
            );
        }
    });
    await legacy.multiRemove(keys);
    return keys.length;
}

/**
 * ReadingProgressStore 的 SQLite 存储：保持原有键值接口，记录原样存取，格式校验仍由 store 负责。
 * 每次操作先等旧数据搬迁结束（无论成败），保证读到搬迁后的记录、新写入不被搬迁覆盖。
 */
export function sqliteReadingStorage(
    database: ApplicationDatabase,
    ready: Promise<unknown>,
): ReadingStorage {
    return {
        async getItem(key) {
            await ready;
            const id = parseKey(key);
            if (!id) return null;
            const row = await database.getFirst<{ record_json: string }>(
                "SELECT record_json FROM note_reading_progress WHERE owner_user_id=? AND note_id=?",
                [id.owner, id.note],
            );
            return row?.record_json ?? null;
        },
        async setItem(key, value) {
            await ready;
            const id = parseKey(key);
            if (!id) throw new Error("阅读位置记录的键无效");
            await database.run(
                `INSERT INTO note_reading_progress (owner_user_id, note_id, record_json, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(owner_user_id, note_id) DO UPDATE
                 SET record_json = excluded.record_json, updated_at = excluded.updated_at`,
                [id.owner, id.note, value, new Date().toISOString()],
            );
        },
        async getAllKeys() {
            await ready;
            const rows = await database.getAll<{
                owner_user_id: number;
                note_id: number;
            }>("SELECT owner_user_id, note_id FROM note_reading_progress");
            return rows.map((row) => keyFor(row.owner_user_id, row.note_id));
        },
    };
}

/**
 * 笔记永久删除时一并删除阅读进度（移入回收站、清理笔记缓存不调用）。
 * 旧结构的数据库没有这张表时跳过，与其他仓库对旧结构的处理一致。
 */
export async function deleteNoteReadingProgress(
    tx: Tx,
    owner: number,
    clientId: number,
) {
    if (
        !(await tx.getFirst(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_reading_progress'",
        ))
    )
        return;
    await tx.run(
        "DELETE FROM note_reading_progress WHERE owner_user_id=? AND note_id=?",
        [owner, clientId],
    );
}
