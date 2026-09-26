import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";
import { configureDatabaseConnection } from "./database-connection";

/**
 * 事务回滚失败：事务可能仍处于打开状态，数据库落盘状态不确定。
 * 该错误专用于让上层（迁移、未来的升级/恢复流程）可识别并区分于普通业务失败，
 * 遇到时应视为库完整性可疑，需要人工核验或重建，不得静默重试。
 */
export class DatabaseTransactionRollbackError extends Error {
    /** 触发回滚的业务/迁移原始错误。 */
    readonly originalError: unknown;
    /** 回滚语句自身的失败原因。 */
    readonly rollbackError: unknown;

    constructor(originalError: unknown, rollbackError: unknown) {
        const originalMessage =
            originalError instanceof Error
                ? originalError.message
                : String(originalError);
        super(
            `[Database] Transaction rollback failed; database state is uncertain and may require a rebuild. Original error: ${originalMessage}`,
        );
        this.name = "DatabaseTransactionRollbackError";
        this.originalError = originalError;
        this.rollbackError = rollbackError;
    }
}

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
            throw new Error(
                "[Database] Cannot resolve transaction database path.",
            );
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
            } catch (rollbackError) {
                // 回滚失败时数据库状态不确定：抛出可识别错误并保留两层原因，
                // 供上层按 DatabaseTransactionRollbackError 决定恢复策略。
                throw new DatabaseTransactionRollbackError(
                    error,
                    rollbackError,
                );
            }
        }
        throw error;
    } finally {
        if (ownsConnection) {
            try {
                await transaction.closeAsync();
            } catch (error) {
                if (!failed) throw error;
                console.error(
                    "[Database] Transaction connection close failed.",
                );
            }
        }
    }
}
