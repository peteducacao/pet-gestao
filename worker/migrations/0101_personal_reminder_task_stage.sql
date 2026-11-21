-- Associação opcional e aditiva entre lembrete pessoal e etapa da demanda.
-- Registros existentes continuam vinculados à demanda inteira (NULL).
ALTER TABLE personal_reminders ADD COLUMN task_stage_id TEXT;
CREATE INDEX IF NOT EXISTS idx_personal_reminders_task_stage
 ON personal_reminders(task_id,task_stage_id);
