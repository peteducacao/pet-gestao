-- Limpeza preventiva de notificações antigas endereçadas ao próprio autor,
-- sem modificar mensagens já enviadas nem as de outros destinatários.
UPDATE email_queue
SET recipient_emails=(
 SELECT coalesce(json_group_array(j.value),'[]')
 FROM json_each(email_queue.recipient_emails) AS j
 WHERE lower(j.value)<>lower((SELECT u.email FROM users u WHERE u.id=email_queue.creator_id))
)
WHERE creator_id IS NOT NULL AND status IN ('pendente','agendado');
UPDATE email_queue SET status='cancelado'
WHERE creator_id IS NOT NULL AND status IN ('pendente','agendado')
  AND json_valid(recipient_emails) AND json_array_length(recipient_emails)=0;

-- Única sessão atual por navegador, independentemente da conta utilizada.
DELETE FROM sessions
WHERE browser_id IS NOT NULL AND rowid NOT IN (
 SELECT MAX(rowid) FROM sessions WHERE browser_id IS NOT NULL GROUP BY browser_id
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_browser_unique
ON sessions(browser_id) WHERE browser_id IS NOT NULL;
