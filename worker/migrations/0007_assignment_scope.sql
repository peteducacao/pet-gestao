-- Registra o modo escolhido (Pessoas, Comissões, Todos), sem recriar ou alterar vínculos.
-- NULL nos registros existentes permite inferir o modo anterior pela lista de responsáveis.
ALTER TABLE tasks ADD COLUMN assignment_scope TEXT CHECK(assignment_scope IN ('usuarios','comissoes','todos'));
