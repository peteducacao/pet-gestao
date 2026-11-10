-- Registro independente da fila de e-mails para evitar envio duplicado
-- em cron executado a cada cinco minutos. A exclusão de uma demanda
-- remove seus registros de lembrete, sem tocar nos cadastros das comissões.
CREATE TABLE IF NOT EXISTS deadline_notice_log (
  dedupe_key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  notice_kind TEXT NOT NULL CHECK(notice_kind IN ('due_soon','overdue')),
  stage_due_at TEXT NOT NULL,
  queue_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_deadline_notice_task ON deadline_notice_log(task_id);
