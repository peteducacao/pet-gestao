-- Exibição na Visão geral é opcional; demandas anteriores permanecem visíveis.
-- Não muda quem pode consultar ou concluir a demanda.
ALTER TABLE tasks ADD COLUMN overview_visible INTEGER NOT NULL DEFAULT 1 CHECK(overview_visible IN (0,1));
