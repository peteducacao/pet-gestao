-- Anexos persistentes de demandas. Os arquivos ficam em BLOBs divididos em partes
-- menores que o limite de 2 MB por registro do Cloudflare D1.
-- Não há pasta pública nem acesso direto aos dados sem autenticação do Worker.
CREATE TABLE IF NOT EXISTS task_attachments (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 40),
 status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id,status,created_at);
CREATE TABLE IF NOT EXISTS task_attachment_chunks (
 attachment_id TEXT NOT NULL REFERENCES task_attachments(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK(chunk_index BETWEEN 0 AND 39),
 data BLOB NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 262144),
 PRIMARY KEY(attachment_id,chunk_index)
);
