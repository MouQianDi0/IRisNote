import type {
    SQLiteBindParams,
    SQLiteDatabase,
    SQLiteRunResult,
} from "expo-sqlite";

export type DatabaseMigration = {
    version: number;
    name: string;
    up: (database: SQLiteDatabase) => Promise<void>;
};

export type ApplicationDatabaseTransaction = {
    run: (
        source: string,
        params?: SQLiteBindParams,
    ) => Promise<SQLiteRunResult>;
    getFirst: <T>(
        source: string,
        params?: SQLiteBindParams,
    ) => Promise<T | null>;
    getAll: <T>(source: string, params?: SQLiteBindParams) => Promise<T[]>;
};

export type ApplicationDatabase = ApplicationDatabaseTransaction & {
    transaction: <T>(
        task: (transaction: ApplicationDatabaseTransaction) => Promise<T>,
    ) => Promise<T>;
};

export type DatabaseDiagnosticCheck = {
    name: string;
    passed: boolean;
};

export type DatabaseDiagnosticReport = {
    platform: string;
    schemaVersion: number;
    checks: DatabaseDiagnosticCheck[];
};
