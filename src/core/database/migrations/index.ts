import type { DatabaseMigration } from "../database.types";
import { createMigrationLedger } from "./0001-create-migration-ledger";
import { createLocalNotes } from "./0002-create-local-notes";
import { createNoteDrafts } from "./0003-create-note-drafts";
import { createNoteRevisions } from "./0004-create-note-revisions";
import { createUploadQueue } from "./0005-create-upload-queue";
import { addServerUpdatedAt } from "./0006-add-server-updated-at";
import { addNoteSyncState } from "./0007-add-note-sync-state";

export const databaseMigrations: readonly DatabaseMigration[] = [
    createMigrationLedger,
    createLocalNotes,
    createNoteDrafts,
    createNoteRevisions,
    createUploadQueue,
    addServerUpdatedAt,
    addNoteSyncState,
];

export const CURRENT_DATABASE_VERSION = databaseMigrations.at(-1)?.version ?? 0;
