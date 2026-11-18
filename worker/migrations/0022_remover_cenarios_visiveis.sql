-- Limpeza autorizada dos 24 cenários, 4 contas e 2 comissões [TESTE]
-- da migração 0021. Os IDs fixos evitam excluir atividades ou perfis reais.
-- Preservar os resumos das comissões reais e os testes automatizados isolados.

-- Se uma tarefa real foi atribuída acidentalmente a um participante fictício,
-- mantê-la e retirar somente o ID de teste de suas responsabilidades.
UPDATE tasks
SET assignee_ids=(
  SELECT coalesce(json_group_array(value),'[]')
  FROM json_each(tasks.assignee_ids) WHERE value NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (SELECT 1 FROM json_each(tasks.assignee_ids) WHERE value IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));

UPDATE tasks
SET commission_ids=(
  SELECT coalesce(json_group_array(value),'[]')
  FROM json_each(tasks.commission_ids) WHERE value NOT IN ('pet-demo-comissao-20261117','pet-demo-comissao-apoio-20261117')
)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (SELECT 1 FROM json_each(tasks.commission_ids) WHERE value IN ('pet-demo-comissao-20261117','pet-demo-comissao-apoio-20261117'));

-- As marcações realizadas por contas fictícias também não devem ficar
-- vinculadas a demandas de outras pessoas.
UPDATE tasks
SET user_done=json_remove(user_done,'$."pet-demo-ana-20261117"','$."pet-demo-bruno-20261117"','$."pet-demo-carla-20261117"','$."pet-demo-davi-20261117"')
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (SELECT 1 FROM json_each(tasks.user_done) WHERE key IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));

UPDATE tasks
SET commission_done=json_remove(commission_done,'$."pet-demo-comissao-20261117"','$."pet-demo-comissao-apoio-20261117"')
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (SELECT 1 FROM json_each(tasks.commission_done) WHERE key IN ('pet-demo-comissao-20261117','pet-demo-comissao-apoio-20261117'));

-- Responsabilidades em etapas ficam como JSON independente do campo assignee_ids.
-- Recriar o array apenas nas demandas reais onde uma etapa inclui conta fictícia.
UPDATE tasks
SET deadlines=(
 SELECT coalesce(json_group_array(json_set(
  json(stage.value),
  '$.assigneeIds',
  json((SELECT coalesce(json_group_array(owner.value),'[]')
        FROM json_each(stage.value,'$.assigneeIds') AS owner
        WHERE owner.value NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'))
 ))),'[]')
 FROM json_each(tasks.deadlines) AS stage
)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (
   SELECT 1 FROM json_each(tasks.deadlines) AS stage,
                 json_each(stage.value,'$.assigneeIds') AS owner
   WHERE owner.value IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  );

-- Remover a participação de comissões fictícias nos metadados de cada etapa.
UPDATE tasks
SET deadlines=(
 SELECT coalesce(json_group_array(
   json_remove(json(stage.value),
     '$."commissionCompleted"."pet-demo-comissao-20261117"','$."commissionCompleted"."pet-demo-comissao-apoio-20261117"'
   )
 ),'[]')
 FROM json_each(tasks.deadlines) AS stage
)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND EXISTS (
    SELECT 1 FROM json_each(tasks.deadlines) AS stage,
                  json_each(stage.value,'$.commissionCompleted') AS done
    WHERE done.key IN ('pet-demo-comissao-20261117','pet-demo-comissao-apoio-20261117')
  );

-- Se algum perfil fictício foi definido como autor/editor de material real,
-- preservar o material e vincular a autoria técnica a um Admin real.
UPDATE tasks SET created_by=(SELECT id FROM users WHERE role='admin'
  AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117') ORDER BY created_at LIMIT 1)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND created_by IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin' AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));
UPDATE tasks SET updated_by=(SELECT id FROM users WHERE role='admin'
  AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117') ORDER BY created_at LIMIT 1)
WHERE id NOT LIKE 'pet-cenario-20261117-%'
  AND updated_by IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin' AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));

UPDATE meetings SET created_by=(SELECT id FROM users WHERE role='admin'
  AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117') ORDER BY created_at LIMIT 1)
WHERE created_by IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin' AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));
UPDATE meetings SET updated_by=(SELECT id FROM users WHERE role='admin'
  AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117') ORDER BY created_at LIMIT 1)
WHERE updated_by IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  AND EXISTS (SELECT 1 FROM users WHERE role='admin' AND id NOT IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117'));

-- Não enviar os avisos ligados aos cenários excluídos.
DELETE FROM email_queue WHERE task_id LIKE 'pet-cenario-20261117-%';
DELETE FROM tasks WHERE id LIKE 'pet-cenario-20261117-%'
  AND created_by IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117');

-- As tabelas de participação têm ON DELETE CASCADE por comissão/usuário.
DELETE FROM commissions WHERE id IN ('pet-demo-comissao-20261117','pet-demo-comissao-apoio-20261117');
DELETE FROM users WHERE id IN ('pet-demo-ana-20261117','pet-demo-bruno-20261117','pet-demo-carla-20261117','pet-demo-davi-20261117')
  AND email LIKE '%@example.invalid'
  AND pass_hash='ACESSO_DE_TESTE_DESATIVADO';

-- A migração 0021 continua no histórico de banco, sem poder se repetir;
-- esta limpeza é aplicada só uma vez e também em instalações novas.
