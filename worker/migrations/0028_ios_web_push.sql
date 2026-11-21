-- Diferenciar o PWA instalado em iPhone/iPad do navegador em PC.
-- Inscrições anteriores continuam como PC. Nenhum dado existente é apagado.
ALTER TABLE web_push_subscriptions ADD COLUMN platform TEXT NOT NULL DEFAULT 'pc'
  CHECK(platform IN ('pc','ios'));
CREATE INDEX IF NOT EXISTS idx_web_push_subscriptions_platform_user
  ON web_push_subscriptions(platform,user_id);
