from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

from core.config_service import ConfigService
from core.database import DatabaseManager
from core.logging_service import setup_system_logger
from core.security_service import SecurityService
from core.task_manager import TaskManager
from core.workspace import WorkspacePaths, ensure_workspace


@dataclass
class AppContext:
    paths: WorkspacePaths
    db: DatabaseManager
    config: ConfigService
    security: SecurityService
    tasks: TaskManager


def build_app_context() -> AppContext:
    paths = ensure_workspace()
    logger = setup_system_logger(paths.logs_dir)

    db = DatabaseManager(paths.db_path)
    schema_path = Path(__file__).parent / "migrations" / "schema.sql"
    db.initialize(schema_path)

    config_service = ConfigService(db)
    security_service = SecurityService(paths.key_path)

    stop_event = threading.Event()
    task_manager = TaskManager(stop_event)

    logger.info("App context initialized")

    return AppContext(
        paths=paths,
        db=db,
        config=config_service,
        security=security_service,
        tasks=task_manager,
    )
