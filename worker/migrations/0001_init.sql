-- PET Gestão: banco real, sem pessoas ou demandas fictícias.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'petiano' CHECK(role IN ('petiano','tutor','admin')),
 notification_enabled INTEGER NOT NULL DEFAULT 1,
 must_change_password INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts (
 email TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL,
 blocked_until TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS commissions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '',
 background_color TEXT NOT NULL DEFAULT '#f7f3ff', image_data TEXT NOT NULL DEFAULT '',
 max_members INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS commission_members (
 commission_id TEXT NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL,
 PRIMARY KEY(commission_id,user_id)
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 caption_text TEXT NOT NULL DEFAULT '', registered_at TEXT NOT NULL,
 assignee_ids TEXT NOT NULL DEFAULT '[]',
 commission_ids TEXT NOT NULL DEFAULT '[]',
 commission_done TEXT NOT NULL DEFAULT '{}',
 deadlines TEXT NOT NULL DEFAULT '[]',
 status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovada','concluida')),
 archived_at TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_tasks_archive ON tasks(archived_at);
CREATE TABLE IF NOT EXISTS task_history (
 id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, actor_name TEXT NOT NULL,
 action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_task_history_task ON task_history(task_id,created_at);
CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, meeting_date TEXT NOT NULL,
 raw_notes TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT 'classic',
 color_a TEXT NOT NULL DEFAULT '#f7f1ff', color_b TEXT NOT NULL DEFAULT '#e4edff',
 created_by TEXT REFERENCES users(id), updated_by TEXT REFERENCES users(id), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_queue (
 id TEXT PRIMARY KEY, creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 kind TEXT NOT NULL, recipient_emails TEXT NOT NULL, subject TEXT NOT NULL,
 body TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente',
 attempts INTEGER NOT NULL DEFAULT 0, error_message TEXT, created_at TEXT NOT NULL,
 sent_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_email_pending ON email_queue(status,scheduled_at);
CREATE TABLE IF NOT EXISTS app_settings (
 key TEXT PRIMARY KEY, value TEXT NOT NULL
);
INSERT OR IGNORE INTO app_settings(key,value) VALUES ('autoMonth','true'),('autoWeek','true');
-- Preservamos os nomes das comissões do PET; nenhum usuário, tarefa ou reunião de teste é inserido.
INSERT OR IGNORE INTO commissions(id,name,sort_order,created_at) VALUES
 ('videos','Vídeos',1,datetime('now')),('cards','Cards',2,datetime('now')),
 ('imaginacao','ImaginAÇÃO',3,datetime('now')),('cinepet','CinePET',4,datetime('now')),
 ('salinha','Salinha',5,datetime('now')),('financas','Finanças',6,datetime('now')),
 ('legendas','Legendas',7,datetime('now')),('site','Site',8,datetime('now')),
 ('comemoracoes','Comemorações',9,datetime('now')),
 ('impressora-3d','Impressora 3D',10,datetime('now'));
