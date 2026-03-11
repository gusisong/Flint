from __future__ import annotations

import threading
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from core.config_service import ConfigService
from core.database import DatabaseManager
from core.security_service import SecurityService
from core.task_manager import TaskManager
from core.workspace import WorkspacePaths
from modules.email_sender.module import EmailSenderModule
from modules.inbound_planning_review.module import InboundPlanningReviewModule
from modules.supplier_management.module import SupplierManagementModule
from modules.system_settings.module import SystemSettingsModule


class DummyPage:
    def __init__(self) -> None:
        self.overlay: list[object] = []
        self.update_calls = 0
        self.dialogs: list[object] = []
        self.window = SimpleNamespace(destroy=lambda: None)

    def update(self) -> None:
        self.update_calls += 1

    def open(self, dialog: object) -> None:
        self.dialogs.append(dialog)

    def close(self, _dialog: object) -> None:
        return


class ContextFactory:
    def __init__(self) -> None:
        self.tmp = TemporaryDirectory()
        root = Path(self.tmp.name)
        data_dir = root / "data"
        logs_dir = data_dir / "logs"
        logs_dir.mkdir(parents=True, exist_ok=True)

        db_path = data_dir / "platform_core.db"
        key_path = data_dir / "secret.key"
        schema = Path("d:/Code/Flint/core/migrations/schema.sql")

        self.paths = WorkspacePaths(
            root=root,
            data_dir=data_dir,
            logs_dir=logs_dir,
            db_path=db_path,
            key_path=key_path,
        )
        self.db = DatabaseManager(db_path)
        self.db.initialize(schema)
        self.config = ConfigService(self.db)
        self.security = SecurityService(key_path)
        self.tasks = TaskManager(threading.Event())

    def build(self):
        return SimpleNamespace(
            paths=self.paths,
            db=self.db,
            config=self.config,
            security=self.security,
            tasks=self.tasks,
        )

    def cleanup(self) -> None:
        self.db.close()
        self.tmp.cleanup()


def test_email_sender_scan_and_retry_workflow() -> None:
    factory = ContextFactory()
    try:
        context = factory.build()
        module = EmailSenderModule(context)
        page = DummyPage()

        module.on_load()
        module.build_ui(page)

        context.db.execute(
            "INSERT INTO suppliers(supplier_code, supplier_name, emails, is_active) VALUES(?, ?, ?, 1)",
            ("12345", "ACME", "a@example.com"),
        )

        file_path = context.paths.root / "PRJ_A" / "foo_12345_demo.txt"
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text("demo", encoding="utf-8")

        module._scan_workspace()
        rows = context.db.query_all("SELECT status, supplier_code FROM email_tasks")
        assert len(rows) == 1
        assert rows[0]["supplier_code"] == "12345"

        context.db.execute("UPDATE email_tasks SET status = 'FAILED'")
        module._retry_failed()
        retried = context.db.query_one("SELECT status FROM email_tasks")
        assert retried is not None
        assert retried["status"] == "PENDING"
    finally:
        factory.cleanup()


def test_inbound_module_build_and_buttons_do_not_crash() -> None:
    factory = ContextFactory()
    try:
        context = factory.build()
        module = InboundPlanningReviewModule(context)
        page = DummyPage()

        module.on_load()
        module.build_ui(page)
        module._refresh_logs()
        module._start_review()
        module._export_log()
        module._reset_state()

        assert page.update_calls >= 1
        assert "请先选择文件" in module._status_text.value or "状态已重置" in module._status_text.value
    finally:
        factory.cleanup()


def test_supplier_module_toggle_active_workflow() -> None:
    factory = ContextFactory()
    try:
        context = factory.build()
        module = SupplierManagementModule(context)
        page = DummyPage()

        module.build_ui(page)
        context.db.execute(
            "INSERT INTO suppliers(supplier_code, supplier_name, emails, is_active) VALUES(?, ?, ?, 1)",
            ("10243", "ACME", "a@example.com"),
        )
        module._refresh_suppliers()
        module._select_supplier("10243")
        module._toggle_active()

        row = context.db.query_one("SELECT is_active FROM suppliers WHERE supplier_code = ?", ("10243",))
        assert row is not None
        assert int(row["is_active"]) == 0
    finally:
        factory.cleanup()


def test_system_settings_load_and_save_workflow() -> None:
    factory = ContextFactory()
    try:
        context = factory.build()
        module = SystemSettingsModule(context)
        page = DummyPage()

        module.build_ui(page)
        module._smtp_host.value = "smtp.example.com"
        module._smtp_port.value = "587"
        module._smtp_user.value = "user@example.com"
        module._smtp_password.value = "secret"
        module._smtp_tls.value = True
        module._smtp_dry_run.value = True
        module._regex_field.value = r"_(\d{5})_[^/]+$"
        module._signature_field.value = "Regards"

        module._save_settings()

        smtp = context.config.get_system_config("smtp_settings")
        assert smtp["host"] == "smtp.example.com"
        assert smtp["port"] == 587
        assert smtp["username"] == "user@example.com"

        module._smtp_port.value = "abc"
        module._save_settings()
        assert "SMTP Port 必须为数字" in module._status_text.value
    finally:
        factory.cleanup()
