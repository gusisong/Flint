from __future__ import annotations

import json
from typing import Any

from core.database import DatabaseManager


class ConfigService:
    def __init__(self, db: DatabaseManager) -> None:
        self.db = db

    def get_system_config(self, key: str, default: Any = None) -> Any:
        row = self.db.query_one("SELECT config_value FROM system_configs WHERE config_key = ?", (key,))
        if row is None:
            return default
        return json.loads(row["config_value"])

    def set_system_config(self, key: str, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        self.db.execute(
            """
            INSERT INTO system_configs(config_key, config_value)
            VALUES(?, ?)
            ON CONFLICT(config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = CURRENT_TIMESTAMP
            """,
            (key, payload),
        )

    def get_module_config(self, module_id: str, key: str, default: Any = None) -> Any:
        row = self.db.query_one(
            "SELECT config_value FROM module_configs WHERE module_id = ? AND config_key = ?",
            (module_id, key),
        )
        if row is None:
            return default
        return json.loads(row["config_value"])

    def set_module_config(self, module_id: str, key: str, value: Any) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        self.db.execute(
            """
            INSERT INTO module_configs(module_id, config_key, config_value)
            VALUES(?, ?, ?)
            ON CONFLICT(module_id, config_key) DO UPDATE SET config_value = excluded.config_value, updated_at = CURRENT_TIMESTAMP
            """,
            (module_id, key, payload),
        )
