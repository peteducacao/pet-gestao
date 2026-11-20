-- Um aviso no Android e outro no PC podem coexistir no mesmo minuto,
-- mas o mesmo aparelho/canal não recebe aviso duplicado da mesma demanda.
CREATE TABLE IF NOT EXISTS push_delivery_minute_log(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 task_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('android','pc')),
 minute_key TEXT NOT NULL,
 source TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(user_id,task_id,channel,minute_key)
);
CREATE INDEX IF NOT EXISTS idx_push_delivery_minute_created ON push_delivery_minute_log(created_at);
