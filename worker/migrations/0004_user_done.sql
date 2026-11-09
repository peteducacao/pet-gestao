-- Registrar conclusões pessoais sem apagar ou alterar tarefas existentes.
ALTER TABLE tasks ADD COLUMN user_done TEXT NOT NULL DEFAULT '{}';
