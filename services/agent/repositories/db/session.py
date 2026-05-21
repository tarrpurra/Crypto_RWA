from __future__ import annotations

from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from services.agent.app.core.settings import Settings, get_settings
from services.agent.repositories.db.models import Base


@lru_cache(maxsize=1)
def get_engine():
    settings = get_settings()
    return create_engine(settings.database_url, future=True, pool_pre_ping=True)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False, autoflush=False, future=True)


def init_db(settings: Settings | None = None) -> None:
    del settings
    Base.metadata.create_all(get_engine())


def create_session() -> Session:
    return get_session_factory()()
