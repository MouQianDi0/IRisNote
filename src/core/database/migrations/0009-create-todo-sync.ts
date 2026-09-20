import type { DatabaseMigration } from "../database.types";

export const createTodoSync: DatabaseMigration = {
  version: 9,
  name: "create_todo_sync",
  async up(database) {
    await database.execAsync(`
      CREATE TABLE local_todos_v9 (
        owner_key TEXT NOT NULL CHECK(length(owner_key) > 0),
        client_id TEXT NOT NULL CHECK(length(client_id)=36 AND substr(client_id,9,1)='-'
          AND substr(client_id,14,1)='-' AND substr(client_id,19,1)='-' AND substr(client_id,24,1)='-'
          AND length(replace(client_id,'-',''))=32 AND replace(client_id,'-','') NOT GLOB '*[^0-9a-fA-F]*'),
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
        priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
        date_id TEXT NOT NULL CHECK(date_id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date_id >= '0001-01-01' AND date(date_id,'+0 days') IS NOT NULL AND date(date_id,'+0 days')=date_id),
        start_time TEXT CHECK(start_time IS NULL OR (start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time<='23:59')),
        end_time TEXT CHECK(end_time IS NULL OR (start_time IS NOT NULL AND end_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND end_time<='23:59' AND end_time>=start_time)),
        is_starred INTEGER NOT NULL CHECK(is_starred IN (0,1)),
        is_pinned INTEGER NOT NULL CHECK(is_pinned IN (0,1)),
        reminder_enabled INTEGER NOT NULL CHECK(reminder_enabled IN (0,1)),
        time_zone TEXT,
        is_completed INTEGER NOT NULL CHECK(is_completed IN (0,1)),
        completed_at TEXT,
        local_version INTEGER NOT NULL CHECK(typeof(local_version)='integer' AND local_version>=1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_key,client_id),
        CHECK((is_completed=0 AND completed_at IS NULL) OR (is_completed=1 AND completed_at IS NOT NULL))
      );
      INSERT INTO local_todos_v9 SELECT * FROM local_todos;
      DROP TABLE local_todos;
      ALTER TABLE local_todos_v9 RENAME TO local_todos;
      CREATE INDEX idx_local_todos_owner_date ON local_todos(owner_key,date_id);
      CREATE TABLE IF NOT EXISTS todo_sync_state (
        owner_key TEXT NOT NULL,
        client_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK(sequence > 0),
        candidate_json TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
        dirty INTEGER NOT NULL DEFAULT 1 CHECK(dirty IN (0,1)),
        base_json TEXT,
        remote_json TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','conflict','blocked')),
        error TEXT,
        PRIMARY KEY(owner_key, client_id)
      );
      CREATE TABLE IF NOT EXISTS todo_outbox (
        owner_key TEXT NOT NULL,
        client_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        request_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(owner_key, client_id),
        UNIQUE(owner_key, operation_id)
      );
      CREATE TABLE IF NOT EXISTS todo_sync_cursors (
        owner_key TEXT PRIMARY KEY,
        cursor TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS todo_snapshot_items (
        owner_key TEXT NOT NULL,
        client_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        PRIMARY KEY(owner_key, client_id)
      );
    `);
  },
};
