from __future__ import annotations

import logging

from services.agent.app.core.settings import Settings


def configure_logging(settings: Settings) -> None:
    level_name = settings.log_level.upper() if settings.log_enabled else "CRITICAL"
    logging.basicConfig(
        level=getattr(logging, level_name, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        force=True,
    )

    for subsystem, subsystem_level in settings.subsystem_log_levels.items():
        logger_name = f"services.agent.{subsystem}"
        logging.getLogger(logger_name).setLevel(getattr(logging, subsystem_level.upper(), logging.INFO))
