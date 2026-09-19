import type { DatabaseMigration } from "../database.types";

export const createLocalTodos: DatabaseMigration = {
  version: 7,
  name: "create_local_todos",
  async up(database) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS local_todos (
        owner_key TEXT NOT NULL CHECK(length(owner_key) > 0),
        client_id TEXT NOT NULL CHECK(length(client_id) = 36
          AND substr(client_id, 9, 1) = '-' AND substr(client_id, 14, 1) = '-'
          AND substr(client_id, 19, 1) = '-' AND substr(client_id, 24, 1) = '-'
          AND substr(client_id, 15, 1) = '4'
          AND lower(substr(client_id, 20, 1)) IN ('8', '9', 'a', 'b')
          AND length(replace(client_id, '-', '')) = 32
          AND replace(client_id, '-', '') NOT GLOB '*[^0-9a-fA-F]*'),
        body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
        priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high')),
        date_id TEXT NOT NULL CHECK(
          date_id GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
          AND date_id >= '0001-01-01'
          AND date(date_id, '+0 days') IS NOT NULL
          AND date(date_id, '+0 days') = date_id
        ),
        start_time TEXT CHECK(start_time IS NULL OR (
          start_time GLOB '[0-2][0-9]:[0-5][0-9]' AND start_time <= '23:59'
        )),
        end_time TEXT CHECK(end_time IS NULL OR (
          start_time IS NOT NULL
          AND end_time GLOB '[0-2][0-9]:[0-5][0-9]'
          AND end_time <= '23:59' AND end_time >= start_time
        )),
        is_starred INTEGER NOT NULL CHECK(is_starred IN (0, 1)),
        is_pinned INTEGER NOT NULL CHECK(is_pinned IN (0, 1)),
        reminder_enabled INTEGER NOT NULL CHECK(reminder_enabled IN (0, 1)),
        time_zone TEXT,
        is_completed INTEGER NOT NULL CHECK(is_completed IN (0, 1)),
        completed_at TEXT,
        local_version INTEGER NOT NULL CHECK(typeof(local_version) = 'integer' AND local_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_key, client_id),
        CHECK((is_completed = 0 AND completed_at IS NULL)
          OR (is_completed = 1 AND completed_at IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_local_todos_owner_date ON local_todos(owner_key, date_id);
    `);
  },
};
