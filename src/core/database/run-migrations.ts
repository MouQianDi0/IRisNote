import type { SQLiteDatabase } from "expo-sqlite";
import { databaseMigrations, CURRENT_DATABASE_VERSION } from "./migrations";
import { runPlatformTransaction } from "./transaction";
import { configureDatabaseConnection } from "./database-connection";
import { SerialDatabaseQueue } from "./serial-database-queue";

// 同一运行时按实际路径串行初始化，不按 SQLite 包装对象区分。
const migrationQueues = new Map<string, SerialDatabaseQueue>();

function withMigrationLock<T>(database: SQLiteDatabase, task: () => Promise<T>) {
    let queue = migrationQueues.get(database.databasePath);
    if (!queue) {
        queue = new SerialDatabaseQueue();
        migrationQueues.set(database.databasePath, queue);
    }
    return queue.run(task);
}

type UserVersionRow = {
    user_version: number;
};

type MigrationLedgerRow = {
    version: number;
    name: string;
};

function assertMigrationRegistryIsValid() {
    databaseMigrations.forEach((migration, index) => {
        const expectedVersion = index + 1;
        if (
            migration.version !== expectedVersion ||
            !Number.isSafeInteger(migration.version) ||
            !migration.name.trim()
        ) {
            throw new Error(
                `[Database] Invalid migration registry entry at version ${expectedVersion}.`,
            );
        }
    });
}

async function readUserVersion(database: SQLiteDatabase) {
    const row = await database.getFirstAsync<UserVersionRow>(
        "PRAGMA user_version",
    );
    return row?.user_version ?? 0;
}

async function assertLedgerMatchesVersion(
    database: SQLiteDatabase,
    currentVersion: number,
) {
    if (currentVersion === 0) return;

    const rows = await database.getAllAsync<MigrationLedgerRow>(
        "SELECT version, name FROM schema_migrations ORDER BY version ASC",
    );
    const expectedRows = databaseMigrations.slice(0, currentVersion);

    if (
        rows.length !== expectedRows.length ||
        rows.some(
            (row, index) =>
                row.version !== expectedRows[index]?.version ||
                row.name !== expectedRows[index]?.name,
        )
    ) {
        throw new Error(
            "[Database] Migration ledger does not match PRAGMA user_version.",
        );
    }
}

async function runLockedMigrations(database: SQLiteDatabase) {
    assertMigrationRegistryIsValid();

    for (const migration of databaseMigrations) {
        await runPlatformTransaction(database, async (transaction) => {
            // 写锁取得后重新读取，另一个连接可能已完成该迁移。
            const currentVersion = await readUserVersion(transaction);
            if (
                !Number.isSafeInteger(currentVersion) ||
                currentVersion < 0 ||
                currentVersion > CURRENT_DATABASE_VERSION
            ) {
                throw new Error(
                    `[Database] Unsupported database version ${currentVersion}; supported maximum is ${CURRENT_DATABASE_VERSION}.`,
                );
            }
            await assertLedgerMatchesVersion(transaction, currentVersion);
            if (migration.version <= currentVersion) return;
            if (migration.version !== currentVersion + 1) {
                throw new Error("[Database] Non-contiguous migration attempt.");
            }
            await migration.up(transaction);
            await transaction.runAsync(
                `INSERT INTO schema_migrations (version, name, applied_at)
                 VALUES ($version, $name, $appliedAt)`,
                {
                    $version: migration.version,
                    $name: migration.name,
                    $appliedAt: new Date().toISOString(),
                },
            );
            await transaction.execAsync(
                `PRAGMA user_version = ${migration.version}`,
            );
        });
    }

    return runPlatformTransaction(database, async (transaction) => {
        const finalVersion = await readUserVersion(transaction);
        if (finalVersion !== CURRENT_DATABASE_VERSION) {
            throw new Error("[Database] Unexpected final migration version.");
        }
        await assertLedgerMatchesVersion(transaction, finalVersion);
        return finalVersion;
    });
}

export function runDatabaseMigrations(database: SQLiteDatabase) {
    return withMigrationLock(database, () => runLockedMigrations(database));
}

export function initializeApplicationDatabase(database: SQLiteDatabase) {
    return withMigrationLock(database, async () => {
        try {
            await configureDatabaseConnection(database);
            await database.execAsync("PRAGMA journal_mode = WAL");
            return await runLockedMigrations(database);
        } catch (error) {
            console.error("[Database] Initialization failed.", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            throw error;
        }
    });
}
