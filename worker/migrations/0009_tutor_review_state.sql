-- Conclusão pessoal da revisão: não conclui a demanda ou a comissão.
-- Registra somente que determinado Tutor(a) já realizou sua correção.
CREATE TABLE IF NOT EXISTS task_tutor_reviews (
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reviewed_at TEXT NOT NULL,
 PRIMARY KEY(task_id,user_id)
);
CREATE INDEX IF NOT EXISTS ix_task_tutor_reviews_user ON task_tutor_reviews(user_id,task_id);
