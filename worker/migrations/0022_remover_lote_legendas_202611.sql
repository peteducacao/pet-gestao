-- Reaplica a limpeza dos testes exclusivamente pelo marcador técnico.
-- A migração 0021 já executou com uma expressão LIKE incorreta,
-- que não reconhecia o prefixo literal [TESTE] em SQLite.
DELETE FROM tasks
WHERE id LIKE 'pet-cronograma-legendas-202611-%'
  AND title LIKE '[TESTE]%'
  AND commission_ids='["legendas"]'
  AND assignee_ids='[]'
  AND overview_visible=0;
