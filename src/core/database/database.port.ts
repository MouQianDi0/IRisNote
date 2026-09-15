import type { SQLiteBindParams, SQLiteDatabase } from "expo-sqlite";
import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction,
} from "./database.types";
import { SerialDatabaseQueue } from "./serial-database-queue";
import { runPlatformTransaction } from "./transaction";

function createTransactionPort(database: SQLiteDatabase): ApplicationDatabaseTransaction {
    return {
        run: (source, params = []) => database.runAsync(source, params),
        getFirst: <T>(source: string, params: SQLiteBindParams = []) =>
            database.getFirstAsync<T>(source, params),
        getAll: <T>(source: string, params: SQLiteBindParams = []) =>
            database.getAllAsync<T>(source, params),
    };
}

/** close 仅供 core 生命周期管理使用，不向 Feature 暴露。 */
export function createManagedDatabasePort(database: SQLiteDatabase) {
    const queue = new SerialDatabaseQueue();
    const port: ApplicationDatabase = {
        run: (source, params = []) =>
            queue.run(() => database.runAsync(source, params)),
        getFirst: <T>(source: string, params: SQLiteBindParams = []) =>
            queue.run(() => database.getFirstAsync<T>(source, params)),
        getAll: <T>(source: string, params: SQLiteBindParams = []) =>
            queue.run(() => database.getAllAsync<T>(source, params)),
        transaction: <T>(task: (transaction: ApplicationDatabaseTransaction) => Promise<T>) =>
            queue.run(() =>
                runPlatformTransaction(database, (transaction) =>
                    task(createTransactionPort(transaction)),
                ),
            ),
    };
    return { database: port, close: () => queue.close(() => database.closeAsync()) };
}
