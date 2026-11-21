-- Amplia a categoria de avisos mantendo todos os seis tipos e escolhas já salvas.
-- O CHECK original não aceita 'birthday'; reconstrução preserva dados de cada pessoa.
CREATE TABLE notification_preferences_next(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('create','review','due_soon','overdue','event_soon','event_today','birthday')),
 email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN (0,1)),
 android_enabled INTEGER NOT NULL DEFAULT 0 CHECK(android_enabled IN (0,1)),
 pc_enabled INTEGER NOT NULL DEFAULT 0 CHECK(pc_enabled IN (0,1)),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,kind)
);
INSERT INTO notification_preferences_next(user_id,kind,email_enabled,android_enabled,pc_enabled,updated_at)
 SELECT user_id,kind,email_enabled,android_enabled,pc_enabled,updated_at FROM notification_preferences;
DROP TABLE notification_preferences;
ALTER TABLE notification_preferences_next RENAME TO notification_preferences;
CREATE INDEX idx_notification_preferences_kind ON notification_preferences(kind);
