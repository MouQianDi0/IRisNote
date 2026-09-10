import type { DatabaseMigration } from "../database.types";
import { createMigrationLedger } from "./0001-create-migration-ledger";
import { createLocalNotes } from "./0002-create-local-notes";
import { createNoteDrafts } from "./0003-create-note-drafts";
import { createNoteRevisions } from "./0004-create-note-revisions";

export const databaseMigrations: readonly DatabaseMigration[] = [
    createMigrationLedger,
    createLocalNotes,
    createNoteDrafts,
    createNoteRevisions,
];

export const CURRENT_DATABASE_VERSION =
    databaseMigrations.at(-1)?.version ?? 0;
