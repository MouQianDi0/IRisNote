import type { ApplicationDatabaseTransaction as Tx } from "@/core/database";
import type { Category } from "../categories.types";

export type LocalCategory = Category & {
    server_id: number | null;
    version: number;
    dirty: number;
    deleted: number;
    create_started: number;
};
export const hasLocalCategories = async (db: Tx) =>
    Boolean(
        await db.getFirst(
            "SELECT 1 FROM sqlite_master WHERE name='local_categories'",
        ),
    );
const category = (row: LocalCategory): Category => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    is_pinned: Boolean(row.is_pinned),
    is_starred: Boolean(row.is_starred),
});

export async function importCachedCategories(db: Tx, owner: number) {
    const cached = await db.getFirst<{ value: string }>(
        "SELECT value FROM system_preferences WHERE key=?",
        [`category-cache:user:${owner}`],
    );
    if (!cached) return;
    let rows: unknown;
    try {
        rows = JSON.parse(cached.value);
    } catch {
        return;
    }
    if (!Array.isArray(rows)) return;
    for (const value of rows) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        if (
            typeof row.id !== "number" ||
            row.id <= 0 ||
            !Number.isSafeInteger(row.id) ||
            typeof row.name !== "string" ||
            typeof row.icon !== "string"
        )
            continue;
        await db.run(
            `INSERT OR IGNORE INTO local_categories(owner_user_id,id,server_id,name,icon,is_pinned,is_starred)
            VALUES(?,?,?,?,?,?,?)`,
            [
                owner,
                row.id,
                row.id,
                row.name,
                row.icon,
                Number(Boolean(row.is_pinned)),
                Number(Boolean(row.is_starred)),
            ],
        );
    }
}

export async function listLocalCategories(
    db: Tx,
    owner: number,
): Promise<Category[]> {
    await importCachedCategories(db, owner);
    return (
        await db.getAll<LocalCategory>(
            "SELECT * FROM local_categories WHERE owner_user_id=? AND deleted=0 ORDER BY id",
            [owner],
        )
    ).map(category);
}
export async function mergeRemoteCategories(
    db: Tx,
    owner: number,
    rows: Category[],
    versions?: ReadonlyMap<number, number>,
) {
    await importCachedCategories(db, owner);
    for (const row of rows) {
        await db.run(
            `INSERT INTO local_categories(owner_user_id,id,server_id,name,icon,is_pinned,is_starred)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,server_id) DO UPDATE SET
            name=excluded.name,icon=excluded.icon,is_pinned=excluded.is_pinned,is_starred=excluded.is_starred
            WHERE local_categories.dirty=0 AND local_categories.deleted=0 AND local_categories.version<=?`,
            [
                owner,
                row.id,
                row.id,
                row.name,
                row.icon,
                Number(row.is_pinned),
                Number(row.is_starred),
                versions
                    ? (versions.get(row.id) ?? 0)
                    : Number.MAX_SAFE_INTEGER,
            ],
        );
    }
    // A remote deletion must not erase a locally edited category or resurrect a tombstone.
    const ids = new Set(rows.map((row) => row.id));
    for (const row of await db.getAll<LocalCategory>(
        "SELECT * FROM local_categories WHERE owner_user_id=? AND dirty=0 AND deleted=0",
        [owner],
    )) {
        if (
            row.server_id !== null &&
            !ids.has(row.server_id) &&
            (!versions || versions.get(row.server_id) === row.version)
        )
            await db.run(
                "UPDATE local_categories SET deleted=1 WHERE owner_user_id=? AND id=? AND dirty=0",
                [owner, row.id],
            );
    }
    return listLocalCategories(db, owner);
}
export const readLocalCategory = (db: Tx, owner: number, id: number) =>
    db.getFirst<LocalCategory>(
        "SELECT * FROM local_categories WHERE owner_user_id=? AND id=?",
        [owner, id],
    );

export async function localCategoryMap(db: Tx, owner: number) {
    if (!(await hasLocalCategories(db))) return new Map<number, number>();
    const rows = await db.getAll<{ id: number; server_id: number }>(
        "SELECT id,server_id FROM local_categories WHERE owner_user_id=? AND server_id IS NOT NULL",
        [owner],
    );
    return new Map(rows.map((row) => [row.server_id, row.id]));
}

export async function localCategoryId(
    db: Tx,
    owner: number,
    serverId: number | null,
): Promise<number | null> {
    if (serverId === null || !(await hasLocalCategories(db))) return serverId;
    return (
        (
            await db.getFirst<{ id: number }>(
                "SELECT id FROM local_categories WHERE owner_user_id=? AND server_id=?",
                [owner, serverId],
            )
        )?.id ?? serverId
    );
}
export async function cloudCategoryId(
    db: Tx,
    owner: number,
    id: number | null,
): Promise<number | null> {
    if (id === null || !(await hasLocalCategories(db))) return id;
    const row = await readLocalCategory(db, owner, id);
    if (row?.deleted) return null;
    if (row?.server_id != null) return row.server_id;
    if (id < 0) throw new Error("分类尚未同步，笔记已保存在本机，稍后重试");
    return id;
}
