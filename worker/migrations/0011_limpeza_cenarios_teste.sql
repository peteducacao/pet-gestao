-- Limpeza autorizada dos cenários criados pela migração 0010 (10/11/2026).
-- Exclui somente os identificadores técnicos desta bateria, nunca demandas reais
-- ou outras demandas [TESTE] que tenham sido criadas pela equipe.
-- A exclusão de tasks remove em cascata seus históricos, avaliações da Tutoria
-- e registros de aviso vinculados à demanda.

-- Remover também mensagens de lembrete geradas pelos testes durante a execução,
-- além dos cinco e-mails originalmente inseridos e dos que apontam para esses IDs.
DELETE FROM email_queue
WHERE id LIKE 'pet-email-teste-20261110-%'
   OR id IN (
     SELECT queue_id FROM deadline_notice_log
     WHERE task_id LIKE 'pet-teste-20261110-%'
   )
   OR instr(body, 'pet-teste-20261110-') > 0;

DELETE FROM tasks WHERE id LIKE 'pet-teste-20261110-%';

-- Remover exclusivamente os três perfis fictícios de login desativado.
-- Qualquer referência autoral preservada fora dos testes será reatribuída à
-- Administração real, para não afetar os demais registros.
UPDATE tasks
SET created_by=(SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1)
WHERE created_by IN ('pet-test-petiana-20261110','pet-test-petiano-20261110','pet-test-tutor-20261110')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin');
UPDATE tasks
SET updated_by=(SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1)
WHERE updated_by IN ('pet-test-petiana-20261110','pet-test-petiano-20261110','pet-test-tutor-20261110')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin');

-- Evita nomes de usuários fictícios em responsáveis de outras demandas,
-- caso tenham sido incluídos pelo usuário em um cadastro real após a migração.
UPDATE tasks SET assignee_ids=(
 SELECT coalesce(json_group_array(value),'[]')
 FROM json_each(tasks.assignee_ids)
 WHERE value NOT IN (
  'pet-test-petiana-20261110',
  'pet-test-petiano-20261110',
  'pet-test-tutor-20261110'
 )
) WHERE EXISTS (
 SELECT 1 FROM json_each(tasks.assignee_ids)
 WHERE value IN ('pet-test-petiana-20261110','pet-test-petiano-20261110','pet-test-tutor-20261110')
);

DELETE FROM users
WHERE id IN (
  'pet-test-petiana-20261110',
  'pet-test-petiano-20261110',
  'pet-test-tutor-20261110'
)
AND email LIKE '%@example.invalid'
AND pass_hash='ACESSO_DE_TESTE_DESATIVADO';

-- Conclusões e históricos das demandas reais são preservados.
