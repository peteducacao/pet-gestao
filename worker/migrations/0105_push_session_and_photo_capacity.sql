-- Push somente para assinaturas vinculadas a uma sessão ativa.
-- Inscrições antigas são revalidadas no próximo acesso ao aplicativo.
ALTER TABLE push_devices ADD COLUMN session_hash TEXT;
ALTER TABLE web_push_subscriptions ADD COLUMN session_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_push_devices_session ON push_devices(session_hash);
CREATE INDEX IF NOT EXISTS idx_web_push_session ON web_push_subscriptions(session_hash);

-- O banco antigo suportava só 10 MiB / 40 blocos, enquanto o aplicativo anunciava 25 MiB.
-- A migração preserva integralmente os arquivos existentes, sem recompressão.
CREATE TABLE task_attachments_next (
 id TEXT PRIMARY KEY,
 task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 26214400),
 chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 100),
 status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','ready')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE task_attachment_chunks_next (
 attachment_id TEXT NOT NULL REFERENCES task_attachments_next(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK(chunk_index BETWEEN 0 AND 99),
 data BLOB NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 262144),
 PRIMARY KEY(attachment_id,chunk_index)
);
INSERT INTO task_attachments_next SELECT * FROM task_attachments;
INSERT INTO task_attachment_chunks_next SELECT * FROM task_attachment_chunks;
DROP TABLE task_attachment_chunks;
DROP TABLE task_attachments;
ALTER TABLE task_attachments_next RENAME TO task_attachments;
ALTER TABLE task_attachment_chunks_next RENAME TO task_attachment_chunks;
CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id,status,created_at);

-- Demandas encerradas não podem conservar as fotos: remover arquivos e seus blocos.
DELETE FROM task_attachments WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL);
