import { openDatabaseAsync } from "expo-sqlite";
import {
    APPLICATION_DATABASE_NAME,
    DATABASE_DIAGNOSTICS_ENABLED_VALUE,
} from "./database.constants";
import { createManagedDatabasePort } from "./database.port";
import { initializeApplicationDatabase } from "./run-migrations";
import { SharedDatabaseResource } from "./shared-database-resource";
import { runDatabaseDiagnostics } from "./testing/run-database-diagnostics";

export const applicationDatabaseResource = new SharedDatabaseResource(async () => {
    const database = await openDatabaseAsync(APPLICATION_DATABASE_NAME, {
        useNewConnection: true,
    });
    try {
        await initializeApplicationDatabase(database);
        if (
            __DEV__ &&
            process.env.EXPO_PUBLIC_DATABASE_DIAGNOSTICS === DATABASE_DIAGNOSTICS_ENABLED_VALUE
        ) {
            const report = await runDatabaseDiagnostics();
            console.info("[Database diagnostics] Completed.", report);
        }
        return createManagedDatabasePort(database);
    } catch (error) {
        try {
            await database.closeAsync();
        } catch {
            console.error("[Database] Failed to close initialization connection.");
        }
        throw error;
    }
});
