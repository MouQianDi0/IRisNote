import { createContext, useContext } from "react";
import type { ApplicationDatabase } from "./database.types";

export const ApplicationDatabaseContext =
    createContext<ApplicationDatabase | null>(null);

export function useApplicationDatabase() {
    const database = useContext(ApplicationDatabaseContext);
    if (!database) {
        throw new Error(
            "useApplicationDatabase must be used within ApplicationDatabaseProvider.",
        );
    }
    return database;
}
