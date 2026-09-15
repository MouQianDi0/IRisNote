import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { configureDatabaseConnection } from "./database-connection";

/**
 * 文件型原生库使用独立连接，先设置外键再开始事务。
 * Web / 内存库复用主连接，调用方必须通过公共队列或迁移锁串行进入。
 * BEGIN IMMEDIATE 在读取迁移版本前取得写锁，避免先读后锁的竞态。
 */
export async function runPlatformTransaction<T>(
    database: SQLiteDatabase,
    task: (transactionDatabase: SQLiteDatabase) => Promise<T>,
): Promise<T> {
    const ownsConnection =
        Platform.OS !== "web" && database.databasePath !== ":memory:";
    let transaction = database;
    if (ownsConnection) {
        const separator = database.databasePath.lastIndexOf("/");
        if (separator < 0) {
            throw new Error("[Database] Cannot resolve transaction database path.");
        }
        transaction = await openDatabaseAsync(
            database.databasePath.slice(separator + 1),
            { ...database.options, useNewConnection: true },
            database.databasePath.slice(0, separator),
        );
    }

    let began = false;
    let failed = false;
    try {
        await configureDatabaseConnection(transaction);
        await transaction.execAsync("BEGIN IMMEDIATE");
        began = true;
        const result = await task(transaction);
        await transaction.execAsync("COMMIT");
        began = false;
        return result;
    } catch (error) {
        failed = true;
        if (began) {
            try {
                await transaction.execAsync("ROLLBACK");
            } catch {
                console.error("[Database] Transaction rollback failed.");
            }
        }
        throw error;
    } finally {
        if (ownsConnection) {
            try {
                await transaction.closeAsync();
            } catch (error) {
                if (!failed) throw error;
                console.error("[Database] Transaction connection close failed.");
            }
        }
    }
}
