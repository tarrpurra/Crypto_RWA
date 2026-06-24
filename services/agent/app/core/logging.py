from __future__ import annotations

import logging

from services.agent.app.core.log_buffer import InMemoryLogBufferHandler
from services.agent.app.core.settings import Settings


def configure_logging(settings: Settings) -> None:
    level_name = settings.log_level.upper() if settings.log_enabled else "CRITICAL"
    logging.basicConfig(
        level=getattr(logging, level_name, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        force=True,
    )
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    buffer_handler = InMemoryLogBufferHandler()
    buffer_handler.setLevel(getattr(logging, level_name, logging.INFO))
    buffer_handler.setFormatter(formatter)
    logging.getLogger().addHandler(buffer_handler)

    for subsystem, subsystem_level in settings.subsystem_log_levels.items():
        logger_name = f"services.agent.{subsystem}"
        logging.getLogger(logger_name).setLevel(getattr(logging, subsystem_level.upper(), logging.INFO))
