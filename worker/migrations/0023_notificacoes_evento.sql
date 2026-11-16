-- 0023: Corrige restrição antiga que só aceitava due_soon e overdue.
-- Inclui aviso antecipado e aviso no dia do evento, mais estados de envio
-- confirmados, preservando todos os registros/deduplicações existentes.
-- Executado pela rotina de migrações do Worker, no D1, em transação.
CREATE TABLE deadline_notice_log_v2 (
  dedupe_key TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  notice_kind TEXT NOT NULL CHECK(notice_kind IN (
    'due_soon','overdue','event_soon','event_today',
    'event_soon_sent','event_today_sent'
  )),
  stage_due_at TEXT NOT NULL,
  queue_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO deadline_notice_log_v2
  (dedupe_key,task_id,stage_id,notice_kind,stage_due_at,queue_id,created_at)
SELECT dedupe_key,task_id,stage_id,notice_kind,stage_due_at,queue_id,created_at
  FROM deadline_notice_log;
DROP TABLE deadline_notice_log;
ALTER TABLE deadline_notice_log_v2 RENAME TO deadline_notice_log;
CREATE INDEX IF NOT EXISTS ix_deadline_notice_task ON deadline_notice_log(task_id);
