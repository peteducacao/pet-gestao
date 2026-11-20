-- Preferências por tipo/canal e alarmes pessoais isolados por usuário.
CREATE TABLE IF NOT EXISTS notification_preferences(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('create','review','due_soon','overdue','event_soon','event_today')),
 email_enabled INTEGER NOT NULL DEFAULT 1 CHECK(email_enabled IN (0,1)),
 android_enabled INTEGER NOT NULL DEFAULT 1 CHECK(android_enabled IN (0,1)),
 pc_enabled INTEGER NOT NULL DEFAULT 1 CHECK(pc_enabled IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,kind)
);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_kind ON notification_preferences(kind);
CREATE TABLE IF NOT EXISTS personal_reminders(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 message TEXT NOT NULL DEFAULT '',
 channels TEXT NOT NULL,
 auto_delete INTEGER NOT NULL DEFAULT 1 CHECK(auto_delete IN (0,1)),
 recurrence TEXT NOT NULL DEFAULT 'once' CHECK(recurrence IN ('once','daily','weekly')),
 repeat_until TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_reminders_user ON personal_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_reminders_task ON personal_reminders(task_id);
CREATE TABLE IF NOT EXISTS personal_reminder_times(
 id TEXT PRIMARY KEY,
 reminder_id TEXT NOT NULL REFERENCES personal_reminders(id) ON DELETE CASCADE,
 time_local TEXT NOT NULL,
 weekday INTEGER,
 next_at TEXT,
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','processando','disparado')),
 notified_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_personal_reminder_times_due ON personal_reminder_times(status,next_at);
