import {
    backupDatabaseAsync,
    deleteDatabaseAsync,
    openDatabaseAsync,
    type SQLiteDatabase,
} from "expo-sqlite";
import { Platform } from "react-native";
import {
    APPLICATION_DATABASE_NAME,
    DIAGNOSTIC_BACKUP_DATABASE_NAME,
    DIAGNOSTIC_DATABASE_NAME,
} from "../database.constants";
import type {
    DatabaseDiagnosticCheck,
    DatabaseDiagnosticReport,
} from "../database.types";
import {
    initializeApplicationDatabase,
    runDatabaseMigrations,
} from "../run-migrations";
import { createManagedDatabasePort } from "../database.port";
import { runLifecycleDiagnostics } from "./run-lifecycle-diagnostics";

const DIAGNOSTIC_MARKER = "migration-and-persistence";
const ROLLBACK_MARKER = "must-not-survive";
const CLOSE_MARKER = "accepted-before-close";

function assertDiagnosticDatabaseNamesAreSafe() {
    const names = [
        DIAGNOSTIC_DATABASE_NAME,
        DIAGNOSTIC_BACKUP_DATABASE_NAME,
    ];
    if (
        names.includes(APPLICATION_DATABASE_NAME) ||
        new Set(names).size !== names.length
    ) {
        throw new Error("[Database diagnostics] Unsafe database names.");
    }
}

function addCheck(
    checks: DatabaseDiagnosticCheck[],
    name: string,
    passed: boolean,
) {
    checks.push({ name, passed });
    if (!passed) {
        throw new Error(`[Database diagnostics] Check failed: ${name}`);
    }
}

async function closeQuietly(database: SQLiteDatabase | null) {
    try {
        await database?.closeAsync();
    } catch {
        // 诊断清理不覆盖原始测试错误。
    }
}

async function deleteQuietly(databaseName: string) {
    try {
        await deleteDatabaseAsync(databaseName);
    } catch {
        // 数据库首次运行时可能不存在；后续打开会创建干净文件。
    }
}

export async function runDatabaseDiagnostics(): Promise<DatabaseDiagnosticReport> {
    assertDiagnosticDatabaseNamesAreSafe();

    const checks: DatabaseDiagnosticCheck[] = [];
    let source: SQLiteDatabase | null = null;
    let backup: SQLiteDatabase | null = null;
    let peer: SQLiteDatabase | null = null;
    let managed: ReturnType<typeof createManagedDatabasePort> | null = null;

    await deleteQuietly(DIAGNOSTIC_DATABASE_NAME);
    await deleteQuietly(DIAGNOSTIC_BACKUP_DATABASE_NAME);

    try {
        await runLifecycleDiagnostics((name, passed) => addCheck(checks, name, passed));
        source = await openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME);
        peer = await openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME, { useNewConnection: true });
        // allSettled 确保任一初始化失败时，也先等其余初始化结束才清理连接。
        const concurrent = await Promise.allSettled([
            initializeApplicationDatabase(source),
            initializeApplicationDatabase(source),
            initializeApplicationDatabase(peer),
        ]);
        for (const result of concurrent) {
            if (result.status === "rejected") throw result.reason;
        }
        const schemaVersion = await runDatabaseMigrations(source);
        addCheck(checks, "concurrent-initialization", concurrent.every(
            (result) => result.status === "fulfilled" && result.value === schemaVersion,
        ));
        const peerToClose = peer;
        peer = null;
        await peerToClose.closeAsync();
        const repeatedVersion = await runDatabaseMigrations(source);
        addCheck(
            checks,
            "migration-idempotency",
            repeatedVersion === schemaVersion,
        );

        await source.execAsync(`
            CREATE TABLE diagnostic_records (
                value TEXT PRIMARY KEY NOT NULL
            );
        `);
        await source.runAsync(
            "INSERT INTO diagnostic_records (value) VALUES (?)",
            [DIAGNOSTIC_MARKER],
        );
        const sourceToClose = source;
        source = null;
        await sourceToClose.closeAsync();
        source = await openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME);

        const persisted = await source.getFirstAsync<{ value: string }>(
            "SELECT value FROM diagnostic_records WHERE value = ?",
            [DIAGNOSTIC_MARKER],
        );
        addCheck(
            checks,
            "reopen-persistence",
            persisted?.value === DIAGNOSTIC_MARKER,
        );

        managed = createManagedDatabasePort(source);
        source = null; // 此连接的关闭权从这里起只属于 managed。
        const port = managed.database;

        try {
            await port.transaction(async (transaction) => {
                await transaction.run(
                    "INSERT INTO diagnostic_records (value) VALUES (?)",
                    [ROLLBACK_MARKER],
                );
                throw new Error("DIAGNOSTIC_FORCED_ROLLBACK");
            });
        } catch (error) {
            if (
                !(error instanceof Error) ||
                error.message !== "DIAGNOSTIC_FORCED_ROLLBACK"
            ) {
                throw error;
            }
        }

        const rolledBack = await port.getFirst<{ value: string }>(
            "SELECT value FROM diagnostic_records WHERE value = ?",
            [ROLLBACK_MARKER],
        );
        addCheck(checks, "transaction-rollback", rolledBack === null);

        await port.run("CREATE TABLE diagnostic_parents (id INTEGER PRIMARY KEY)");
        await port.run(`CREATE TABLE diagnostic_children (
            id INTEGER PRIMARY KEY,
            parent_id INTEGER NOT NULL REFERENCES diagnostic_parents(id) ON DELETE CASCADE
        )`);
        await port.transaction(async (transaction) => {
            const enabled = await transaction.getFirst<{ foreign_keys: number }>("PRAGMA foreign_keys");
            addCheck(checks, "transaction-foreign-keys-enabled", enabled?.foreign_keys === 1);
            await transaction.run("INSERT INTO diagnostic_parents (id) VALUES (1)");
            await transaction.run("INSERT INTO diagnostic_children (id, parent_id) VALUES (1, 1)");
        });
        let foreignKeyRejected = false;
        try {
            await port.transaction((transaction) => transaction.run(
                "INSERT INTO diagnostic_children (id, parent_id) VALUES (2, 999)",
            ));
        } catch (error) {
            if (!(error instanceof Error) || !/foreign key/i.test(error.message)) throw error;
            foreignKeyRejected = true;
        }
        addCheck(checks, "transaction-rejects-orphan", foreignKeyRejected);
        await port.transaction((transaction) => transaction.run(
            "DELETE FROM diagnostic_parents WHERE id = 1",
        ));
        const child = await port.getFirst("SELECT id FROM diagnostic_children LIMIT 1");
        addCheck(checks, "transaction-foreign-key-cascade", child === null);

        // 关闭请求到达时已有事务和查询排队；全部完成后才允许底层关闭。
        const accepted = port.transaction((transaction) => transaction.run(
            "INSERT INTO diagnostic_records (value) VALUES (?)", [CLOSE_MARKER],
        ));
        const queuedRead = port.getFirst<{ value: string }>(
            "SELECT value FROM diagnostic_records WHERE value = ?", [CLOSE_MARKER],
        );
        const close = managed.close();
        addCheck(checks, "port-close-idempotency", close === managed.close());
        const lateRejected = port.getFirst("SELECT 1").then(() => false, () => true);
        // 即使某一项失败，也不在其他已接收任务结束前退出诊断并清理数据库。
        const drainResults = await Promise.allSettled([accepted, queuedRead, close, lateRejected]);
        for (const result of drainResults) {
            if (result.status === "rejected") throw result.reason;
        }
        addCheck(checks, "close-rejects-new-work", await lateRejected);
        addCheck(checks, "close-drains-accepted-work", (await queuedRead)?.value === CLOSE_MARKER);
        managed = null;
        source = await openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME);
        const savedBeforeClose = await source.getFirstAsync<{ value: string }>(
            "SELECT value FROM diagnostic_records WHERE value = ?", [CLOSE_MARKER],
        );
        addCheck(checks, "close-drained-write-persists", savedBeforeClose?.value === CLOSE_MARKER);

        backup = await openDatabaseAsync(DIAGNOSTIC_BACKUP_DATABASE_NAME);
        await backupDatabaseAsync({
            sourceDatabase: source,
            destDatabase: backup,
        });
        const restored = await backup.getFirstAsync<{ value: string }>(
            "SELECT value FROM diagnostic_records WHERE value = ?",
            [DIAGNOSTIC_MARKER],
        );
        addCheck(
            checks,
            "backup-readable",
            restored?.value === DIAGNOSTIC_MARKER,
        );

        return { platform: Platform.OS, schemaVersion, checks };
    } finally {
        try {
            await managed?.close();
        } catch {
            // 不覆盖诊断原始错误；managed.close 本身幂等。
        }
        await closeQuietly(source);
        await closeQuietly(peer);
        await closeQuietly(backup);
        await deleteQuietly(DIAGNOSTIC_DATABASE_NAME);
        await deleteQuietly(DIAGNOSTIC_BACKUP_DATABASE_NAME);
    }
}
