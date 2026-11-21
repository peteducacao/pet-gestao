#!/usr/bin/env python3
"""Valida a importação do Word sem usar dados de produção."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(":memory:")
db.executescript("""
PRAGMA foreign_keys=ON;
CREATE TABLE users(id TEXT PRIMARY KEY);
CREATE TABLE personal_reminders(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,task_id TEXT,title TEXT);
INSERT INTO users(id) VALUES ('pessoa-ci');
""")
migration=Path("worker/migrations/0100_cronograma_pet_2026.sql").read_text(encoding="utf-8")
db.executescript(migration)
assert db.execute("SELECT COUNT(*) FROM schedule_entries").fetchone()[0]==25
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE source='word-2026'").fetchone()[0]==25
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE start_date LIKE '2026-11-%'").fetchone()[0]==22
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE start_date LIKE '2026-12-%'").fetchone()[0]==3
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE start_date>end_date").fetchone()[0]==0
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE start_time IS NULL OR end_time IS NULL").fetchone()[0]>0, "Não inventar horários ausentes"
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE time_note='Manhã e tarde'").fetchone()[0]==3
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE title LIKE '%Fotografia%' AND start_time='14:00' AND end_time='18:00'").fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE title LIKE '%Mostra Nacional de Robótica%' AND start_date='2026-11-23' AND end_date='2026-11-29'").fetchone()[0]==1
assert db.execute("SELECT COUNT(*) FROM schedule_entries WHERE completed_at IS NOT NULL").fetchone()[0]==0, "Datas antigas não são automaticamente concluídas"
db.execute("INSERT INTO personal_reminders(id,user_id,schedule_entry_id,title) VALUES ('lembrete-ci','pessoa-ci','pet-word-2026-001','teste')")
db.execute("DELETE FROM schedule_entries WHERE id='pet-word-2026-001'")
assert db.execute("SELECT COUNT(*) FROM personal_reminders WHERE id='lembrete-ci'").fetchone()[0]==0, "Excluir evento cancela lembretes"
assert db.execute("PRAGMA foreign_key_check").fetchall()==[]
print("OK: 25 atividades importadas, datas e horários preservados, exclusão de lembretes vinculados.")
