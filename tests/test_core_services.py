from __future__ import annotations

import tempfile
import threading
import time
from pathlib import Path
from unittest import TestCase

from core.config_service import ConfigService
from core.database import DatabaseManager
from core.security_service import SecurityService
from core.task_manager import TaskManager


class TestCoreServices(TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        base = Path(self.temp_dir.name)
        self.db_path = base / "platform_core.db"
        self.schema_path = base / "schema.sql"
        self.schema_path.write_text(
            """
            CREATE TABLE IF NOT EXISTS system_configs (
                config_key TEXT PRIMARY KEY,
                config_value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS module_configs (
                module_id TEXT NOT NULL,
                config_key TEXT NOT NULL,
                config_value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (module_id, config_key)
            );
            """,
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_config_service_roundtrip(self) -> None:
        db = DatabaseManager(self.db_path)
        db.initialize(self.schema_path)
        config = ConfigService(db)

        config.set_system_config("smtp", {"host": "smtp.test"})
        config.set_module_config("inbound", "rules", {"threshold": 300})

        self.assertEqual(config.get_system_config("smtp")["host"], "smtp.test")
        self.assertEqual(config.get_module_config("inbound", "rules")["threshold"], 300)
        db.close()

    def test_security_encrypt_decrypt(self) -> None:
        key_path = Path(self.temp_dir.name) / "secret.key"
        security = SecurityService(key_path)

        encrypted = security.encrypt_text("hello")
        self.assertNotEqual(encrypted, "hello")
        self.assertEqual(security.decrypt_text(encrypted), "hello")

    def test_task_manager_submit_and_wait(self) -> None:
        stop_event = threading.Event()
        manager = TaskManager(stop_event)

        def work(local_stop: threading.Event) -> None:
            while not local_stop.is_set():
                time.sleep(0.01)
                break

        manager.submit("demo", work)
        manager.wait_for_all(timeout_seconds=2)

        states = manager.list_states()
        self.assertEqual(len(states), 1)
        self.assertIn(states[0].status, {"SUCCESS", "CANCELED"})

    def test_task_manager_cancel_all(self) -> None:
        stop_event = threading.Event()
        manager = TaskManager(stop_event)

        def work(local_stop: threading.Event) -> None:
            while not local_stop.is_set():
                time.sleep(0.01)

        manager.submit("demo", work)
        manager.cancel_all()
        manager.wait_for_all(timeout_seconds=2)

        self.assertTrue(stop_event.is_set())
        manager.reset_global_stop()
        self.assertFalse(stop_event.is_set())
