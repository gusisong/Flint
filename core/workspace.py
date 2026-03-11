from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path
    data_dir: Path
    logs_dir: Path
    db_path: Path
    key_path: Path


def get_workspace_root() -> Path:
    """Return workspace root for packaged or source runtime."""
    if getattr(sys, "frozen", False):
        return Path(os.path.dirname(sys.executable)).resolve()
    return Path(__file__).resolve().parent.parent


def ensure_workspace() -> WorkspacePaths:
    root = get_workspace_root()
    data_dir = root / "data"
    logs_dir = data_dir / "logs"
    db_path = data_dir / "platform_core.db"
    key_path = data_dir / "secret.key"

    logs_dir.mkdir(parents=True, exist_ok=True)
    return WorkspacePaths(
        root=root,
        data_dir=data_dir,
        logs_dir=logs_dir,
        db_path=db_path,
        key_path=key_path,
    )
