-- Solicitações de mudança de e-mail: confirmação no endereço novo, sem expor tokens.
CREATE TABLE IF NOT EXISTS email_change_requests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  requested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_email_change_expiry ON email_change_requests(expires_at);
CREATE TABLE IF NOT EXISTS email_change_attempts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
