-- Preferências visuais do próprio usuário, independentes de tarefas e notificações.
CREATE TABLE IF NOT EXISTS user_presentation_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 dashboard TEXT NOT NULL DEFAULT '{}',
 profile_theme TEXT NOT NULL DEFAULT 'lavender',
 profile_image TEXT,
 updated_at TEXT NOT NULL
);
