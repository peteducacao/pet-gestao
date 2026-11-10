-- Sessões administrativas são independentes das sessões comuns.
-- Sessões já existentes permanecem válidas para uso comum, mas NÃO para o Admin.
-- Apenas login em /api/v1/auth/admin-login cria admin_scope=1.
ALTER TABLE sessions ADD COLUMN admin_scope INTEGER NOT NULL DEFAULT 0;
