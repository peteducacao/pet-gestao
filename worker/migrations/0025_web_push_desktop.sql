-- Notificações Web Push para PWA no computador; isoladas das opções Android.
-- O par VAPID é gerado de forma persistente no primeiro uso e nunca exposto na API.
CREATE TABLE IF NOT EXISTS web_push_vapid(
 id INTEGER PRIMARY KEY CHECK(id=1),
 public_key TEXT NOT NULL,
 private_key TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS web_push_subscriptions(
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_user ON web_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS web_push_preferences(
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 new_demands INTEGER NOT NULL DEFAULT 1 CHECK(new_demands IN (0,1)),
 deadlines INTEGER NOT NULL DEFAULT 1 CHECK(deadlines IN (0,1)),
 overdue INTEGER NOT NULL DEFAULT 1 CHECK(overdue IN (0,1)),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS web_push_log(
 dedupe_key TEXT PRIMARY KEY,
 subscription_id TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_push_log_subscription ON web_push_log(subscription_id);
