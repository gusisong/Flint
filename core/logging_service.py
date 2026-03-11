from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path


def setup_system_logger(logs_dir: Path) -> logging.Logger:
    logger = logging.getLogger("flint")
    logger.setLevel(logging.INFO)

    if logger.handlers:
        return logger

    log_file = logs_dir / "system.log"
    handler = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s - %(message)s")
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    logger.propagate = False
    return logger
