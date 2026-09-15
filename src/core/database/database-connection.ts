import type { SQLiteDatabase } from "expo-sqlite";

/** 必须在 BEGIN 之前执行；SQLite 在事务内不会改变 foreign_keys。 */
export async function configureDatabaseConnection(database: SQLiteDatabase) {
    await database.execAsync("PRAGMA busy_timeout = 5000");
    await database.execAsync("PRAGMA foreign_keys = ON");
    const setting = await database.getFirstAsync<{ foreign_keys: number }>(
        "PRAGMA foreign_keys",
    );
    if (setting?.foreign_keys !== 1) {
        throw new Error("[Database] Foreign key enforcement is unavailable.");
    }
}
