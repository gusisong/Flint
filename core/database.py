from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Any


class DatabaseManager:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

    def initialize(self, schema_file: Path) -> None:
        schema_sql = schema_file.read_text(encoding="utf-8")
        with self._lock:
            self._conn.executescript(schema_sql)
            self._conn.commit()

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> int:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            self._conn.commit()
            return cursor.rowcount

    def execute_many(self, sql: str, params_seq: list[tuple[Any, ...]]) -> None:
        with self._lock:
            self._conn.executemany(sql, params_seq)
            self._conn.commit()

    def query_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return cursor.fetchall()

    def query_one(self, sql: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        with self._lock:
            cursor = self._conn.execute(sql, params)
            return cursor.fetchone()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
