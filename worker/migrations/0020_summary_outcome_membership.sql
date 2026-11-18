-- Evolução aditiva: preserva todas as demandas e contas reais existentes.
-- NULL identifica registros antigos que não possuíam classificação de conclusão.
ALTER TABLE tasks ADD COLUMN closure_outcome TEXT CHECK(closure_outcome IN ('concluida','nao_concluida') OR closure_outcome IS NULL);
ALTER TABLE tasks ADD COLUMN completed_late INTEGER CHECK(completed_late IN (0,1) OR completed_late IS NULL);

-- Períodos de participação: múltiplas entradas e saídas da mesma pessoa são permitidas.
CREATE TABLE IF NOT EXISTS commission_membership_periods (
 id TEXT PRIMARY KEY,
 commission_id TEXT NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at TEXT NOT NULL,
 left_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_commission_period_lookup ON commission_membership_periods(commission_id,joined_at,left_at);
CREATE INDEX IF NOT EXISTS ix_commission_period_person ON commission_membership_periods(user_id,commission_id);

-- Início da rastreabilidade: só os vínculos ainda existentes podem ser reconstruídos.
INSERT INTO commission_membership_periods(id,commission_id,user_id,joined_at,left_at)
 SELECT 'legacy:' || commission_id || ':' || user_id,commission_id,user_id,created_at,NULL
 FROM commission_members
 WHERE NOT EXISTS (
  SELECT 1 FROM commission_membership_periods p
  WHERE p.commission_id=commission_members.commission_id
    AND p.user_id=commission_members.user_id AND p.left_at IS NULL
 );
