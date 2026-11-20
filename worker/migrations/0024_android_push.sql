-- Registros privados de aparelhos Android: nunca entregar tokens no bootstrap.
CREATE TABLE IF NOT EXISTS push_devices(
 device_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);
CREATE TABLE IF NOT EXISTS push_preferences(
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 new_demands INTEGER NOT NULL DEFAULT 1 CHECK(new_demands IN (0,1)),
 deadlines INTEGER NOT NULL DEFAULT 1 CHECK(deadlines IN (0,1)),
 overdue INTEGER NOT NULL DEFAULT 1 CHECK(overdue IN (0,1)),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_notice_log(
 dedupe_key TEXT PRIMARY KEY,
 device_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_notice_task ON push_notice_log(task_id);
