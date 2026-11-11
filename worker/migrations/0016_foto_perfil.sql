-- Fotos leves de perfil, em JPEG reduzido, no próprio registro da conta.
-- Todas as fotos enviadas pelo navegador são redimensionadas antes de salvar.
ALTER TABLE users ADD COLUMN profile_photo TEXT;
