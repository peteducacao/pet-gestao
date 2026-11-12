-- Limpeza solicitada pelo usuário em 12/11/2026.
-- Retira exclusivamente o lote de vinte demandas fictícias do cronograma de Legendas
-- sem tocar em postagens reais ou em outros testes e sem criar novos usuários.
-- O prefixo técnico é exclusivo das migrações 0019 e 0020.
-- Mantém os vínculos e todas as comissões e usuários.
DELETE FROM tasks
WHERE id LIKE 'pet-cronograma-legendas-202611-%'
  AND title LIKE '[[]TESTE[]]%'
  AND commission_ids='["legendas"]'
  AND assignee_ids='[]'
  AND overview_visible=0;
