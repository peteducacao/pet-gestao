-- Cronograma anual institucional PET 2026. Somente registros do documento enviado.
-- Campos de horas ausentes permanecem NULL; observações originais são preservadas.
CREATE TABLE IF NOT EXISTS schedule_entries (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 start_time TEXT,
 end_time TEXT,
 time_note TEXT,
 location TEXT NOT NULL DEFAULT '',
 completed_at TEXT,
 source TEXT NOT NULL DEFAULT 'manual',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_schedule_period ON schedule_entries(start_date,end_date);
CREATE TABLE IF NOT EXISTS user_quicknav (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 1,
 items TEXT NOT NULL DEFAULT '["inicio","cronograma","demandas","meus-lembretes","conta"]',
 updated_at TEXT NOT NULL
);
-- Importação única: não repõe atividades que o usuário tenha excluído depois.
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-001','Organização para o evento','','2026-11-06','2026-11-06','08:00',NULL,'08h','Hall de entrada do bloco C','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-002','Oficina de Arduino: linguagem computacional, letramento digital e matemática aplicada do DMAI','O PET apresentará o projeto de robótica.','2026-11-06','2026-11-06','09:00',NULL,'09h','Hall de entrada do bloco C','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-003','Organização pós-eventos do material para e na sala do PET','','2026-11-06','2026-11-06','11:30',NULL,'11h30','Sala do PET','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-004','Apoio ao Aulão com Estudantes do Ensino Médio do colégio Magnus','','2026-11-06','2026-11-06','13:00','18:30',NULL,'Auditório','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-005','Organização do espaço','','2026-11-09','2026-11-09','13:00',NULL,'13h','Sala do PET','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-006','CinePET - Falas de ACESSO','','2026-11-09','2026-11-09','14:00',NULL,'14h','Sala do PET','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-007','Webonário PET - Integridade da Informação: Experiências universitárias no enfrentamento à desinformação','','2026-11-09','2026-11-09','16:00',NULL,'16h','YouTube (Ministério da Educação)','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-008','Encontro de Robótica','','2026-11-11','2026-11-11',NULL,NULL,'Manhã e tarde','Sala do PET ou Life','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-009','Formação em Fotografia com Andreza e Sérgio','','2026-11-12','2026-11-12','14:00','18:00',NULL,'Sala do PET','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-010','Apoio ao Aulão com Estudantes do Ensino Médio do colégio Magnus','','2026-11-13','2026-11-13','13:00','18:30',NULL,'Auditório','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-011','Encontro de Robótica','','2026-11-18','2026-11-18',NULL,NULL,'Manhã e tarde','Sala do PET ou Life','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-012','Mostra Nacional de Robótica','','2026-11-23','2026-11-29',NULL,NULL,'—','Centro de Convenções de João Pessoa/PB','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-013','Saída do ônibus do estacionamento do bloco A (AGITTE e MNR)','','2026-11-23','2026-11-23','10:30',NULL,'10h30','UFS-ITA','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-014','18º EIDTI parte 2: Feira de Produtos Educacionais','','2026-11-23','2026-11-23','13:00',NULL,'13h','Didática 7 / UFS de São Cristóvão','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-015','Ida para João Pessoa / Mostra Nacional de Robótica','','2026-11-23','2026-11-23','15:40',NULL,'15h40','Rodoviária Nova / Aracaju','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-016','Visita Monitorada ao Campus','','2026-11-24','2026-11-24','08:30',NULL,'8h30 para organização','Campus Prof. Alberto Carvalho','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-017','SEMAC','','2026-11-25','2026-11-25',NULL,NULL,'—','—','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-018','Apresentação do trabalho “Estufa Inteligente de Baixo Custo para Filamentos 3D”','','2026-11-26','2026-11-26','14:00','16:30',NULL,'Centro de Convenções de João Pessoa/PB','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-019','V InterPET','','2026-11-27','2026-11-27','09:00','16:20',NULL,'Campus ITA','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-020','Apresentação do trabalho “Práticas Sustentáveis com Robótica: construção de lixeiras seletivas em uma escola da rede pública”','','2026-11-27','2026-11-27','09:00','11:30',NULL,'Centro de Convenções de João Pessoa/PB','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-021','Volta para Aracaju / Mostra Nacional de Robótica','','2026-11-27','2026-11-27','19:30',NULL,'19h30','Rodoviária de João Pessoa/PB','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-022','Confraternização PET e GEES: 2ª corrida','','2026-11-28','2026-11-28','07:00',NULL,'07h','Parque das Sementeiras','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-023','Encontro de Robótica','','2026-12-02','2026-12-02',NULL,NULL,'Manhã e tarde','Sala do PET ou Life','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-024','Comemoração PET','','2026-12-03','2026-12-03',NULL,NULL,'—','Sala do PET ou brinquedoteca','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
INSERT INTO schedule_entries(id,title,description,start_date,end_date,start_time,end_time,time_note,location,source,created_at,updated_at)
 VALUES('pet-word-2026-025','Mostra de Robótica','','2026-12-09','2026-12-09',NULL,NULL,'A definir','A definir','word-2026','2026-11-21T00:00:00Z','2026-11-21T00:00:00Z');
