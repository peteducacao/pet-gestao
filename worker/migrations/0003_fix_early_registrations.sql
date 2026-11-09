-- Corrige contas registradas no início do lançamento, quando o cadastro comum
-- atribuía PETiano(a) automaticamente. Não modifica Admin, Tutor, integrantes
-- de comissões, nem quem já tenha realizado trabalho no PET Gestão.
UPDATE users
SET role_override='usuario', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE role='petiano'
  AND role_override IS NULL
  AND created_at >= '2026-11-08'
  AND id NOT IN (SELECT user_id FROM commission_members)
  AND id NOT IN (SELECT created_by FROM tasks)
  AND id NOT IN (SELECT updated_by FROM tasks)
  AND id NOT IN (SELECT actor_id FROM task_history WHERE actor_id IS NOT NULL)
  AND id NOT IN (SELECT created_by FROM meetings WHERE created_by IS NOT NULL)
  AND id NOT IN (SELECT updated_by FROM meetings WHERE updated_by IS NOT NULL);
