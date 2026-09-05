"""SQLite online backups and conservative upgrade checks. No application imports."""
from collections import Counter
from contextlib import closing
from pathlib import Path
import sqlite3

def connect(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + "?mode=ro", uri=True)

def verify(path):
    with closing(connect(path)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign key check failed")

def snapshot(source, target):
    if Path(target).exists():
        raise ValueError("Snapshot destination already exists")
    with closing(connect(source)) as src, closing(sqlite3.connect(target)) as dst:
        src.backup(dst)
    verify(target)

def quoted(name):
    return '"' + name.replace('"', '""') + '"'

def preserves(before, after):
    """Old tables, column declarations and recorded values must all survive.

    This is stronger than SQL text lint, but not proof of semantic compatibility.
    A prior-container smoke test and application tests are separate gates.
    """
    verify(after)
    with closing(connect(before)) as old, closing(connect(after)) as new:
        tables = old.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
        for (table,) in tables:
            old_cols = old.execute(f"PRAGMA table_info({quoted(table)})").fetchall()
            new_cols = new.execute(f"PRAGMA table_info({quoted(table)})").fetchall()
            declarations = {col[1]: col[2:] for col in new_cols}
            for col in old_cols:
                if declarations.get(col[1]) != col[2:]:
                    raise ValueError("Existing schema declaration changed")
            columns = ','.join(quoted(col[1]) for col in old_cols)
            query = f"SELECT {columns} FROM {quoted(table)}"
            if Counter(old.execute(query).fetchall()) - Counter(new.execute(query).fetchall()):
                raise ValueError("Existing database values were removed or rewritten")
