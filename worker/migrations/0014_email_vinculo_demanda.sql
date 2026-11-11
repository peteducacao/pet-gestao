-- Vincula notificações à demanda e impede envio de mensagens obsoletas.
ALTER TABLE email_queue ADD COLUMN task_id TEXT;
UPDATE email_queue SET task_id=(
 SELECT task_id FROM deadline_notice_log WHERE queue_id=email_queue.id LIMIT 1
) WHERE kind IN ('due_soon','overdue');
-- Notificações antigas de criação/revisão não guardavam o vínculo.
-- Para evitar avisos sem verificação, cancelar apenas as ainda pendentes.
UPDATE email_queue SET status='cancelado',
 error_message='Aviso antigo sem vínculo verificável com demanda; cancelado por segurança'
 WHERE kind='automatica' AND task_id IS NULL AND status='pendente';
CREATE INDEX IF NOT EXISTS idx_email_queue_task_status ON email_queue(task_id,status);
