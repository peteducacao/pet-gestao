-- Mantém os vínculos e sessões existentes; o cargo Usuário é um perfil de acesso
-- separado do PETiano(a), sem reconstruir a tabela referenciada por outras tabelas.
ALTER TABLE users ADD COLUMN role_override TEXT DEFAULT NULL CHECK (role_override IS NULL OR role_override='usuario');
-- Contas comuns abertas desde o lançamento não devem nascer como PETiano(a).
-- Preservar integrantes de comissões e cargos explicitamente atribuídos.
UPDATE users
SET role_override='usuario', updated_at=CURRENT_TIMESTAMP
WHERE role='petiano' AND role_override IS NULL
  AND created_at >= '2026-11-09'
  AND id NOT IN (SELECT user_id FROM commission_members);
