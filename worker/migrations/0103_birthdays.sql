-- Não expor data de nascimento nas listagens públicas ou administrativas.
ALTER TABLE users ADD COLUMN birth_date TEXT;
-- Evita duplicatas de parabéns por ano e canal (inclusive reexecução do cron).
CREATE TABLE IF NOT EXISTS birthday_delivery_log (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 year INTEGER NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('email','push')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,year,channel)
);
