from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from services.agent.app.core.settings import Settings, get_settings
from services.agent.repositories.db.models import Base


import logging

logger = logging.getLogger("services.agent.db.session")

_ENGINE = None
_SESSION_FACTORY = None


def _is_test_runtime(settings: Settings) -> bool:
    import os

    app_env = (settings.app_env or "").strip().lower()
    return app_env == "test" or os.getenv("PYTEST_CURRENT_TEST") is not None


def get_engine():
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE

    settings = get_settings()
    db_url = settings.database_url
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

    try:
        engine = create_engine(db_url, future=True, pool_pre_ping=True)
        with engine.connect() as conn:
            pass
        _ENGINE = engine
        logger.info("Connected to database successfully.")
        return _ENGINE
    except Exception as exc:
        if _is_test_runtime(settings):
            logger.warning(
                "Failed to connect to database %s during test runtime: %s. Using in-memory SQLite for tests only.",
                db_url,
                exc,
            )
            _ENGINE = create_engine("sqlite+pysqlite:///:memory:", future=True, connect_args={"check_same_thread": False})
            return _ENGINE
        raise RuntimeError(
            "Persistent database connection failed. Refusing to use in-memory SQLite outside test runtime "
            "because AIxRWA requires durable portfolio, risk, decision, proposal, and vault snapshots."
        ) from exc


def get_session_factory() -> sessionmaker[Session]:
    global _SESSION_FACTORY
    if _SESSION_FACTORY is not None:
        return _SESSION_FACTORY
    _SESSION_FACTORY = sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False, future=True)
    return _SESSION_FACTORY


def init_db(settings: Settings | None = None) -> None:
    del settings
    try:
        Base.metadata.create_all(get_engine())
    except Exception as exc:
        logger.error("Failed to initialize database schema: %s", exc)


def create_session() -> Session:
    return get_session_factory()()
