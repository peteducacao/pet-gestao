-- Evitar duas contas ativas no mesmo navegador e permitir limpar
-- a visualização de atualizações sem apagar o histórico institucional.
ALTER TABLE sessions ADD COLUMN browser_id TEXT;
CREATE INDEX IF NOT EXISTS ix_sessions_browser ON sessions(browser_id);
ALTER TABLE users ADD COLUMN activity_cleared_at TEXT;
