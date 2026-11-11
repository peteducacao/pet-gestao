-- Impede novas duplicatas mesmo se dois cadastros forem enviados ao mesmo tempo.
-- Registros legados são preservados (nenhuma conta é excluída).
CREATE TRIGGER IF NOT EXISTS users_email_normalized_insert
BEFORE INSERT ON users
WHEN EXISTS(
 SELECT 1 FROM users
 WHERE lower(trim(email))=lower(trim(NEW.email))
)
BEGIN
 SELECT RAISE(ABORT,'EMAIL_ALREADY_REGISTERED');
END;

CREATE TRIGGER IF NOT EXISTS users_email_normalized_update
BEFORE UPDATE OF email ON users
WHEN EXISTS(
 SELECT 1 FROM users
 WHERE lower(trim(email))=lower(trim(NEW.email)) AND id<>OLD.id
)
BEGIN
 SELECT RAISE(ABORT,'EMAIL_ALREADY_REGISTERED');
END;
