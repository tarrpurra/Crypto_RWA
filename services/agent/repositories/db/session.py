from __future__ import annotations

from sqlalchemy import create_engine, inspect, text
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
        engine = get_engine()
        Base.metadata.create_all(engine)
        _sync_schema(engine)
    except Exception as exc:
        logger.error("Failed to initialize database schema: %s", exc)


def create_session() -> Session:
    return get_session_factory()()


def _sync_schema(engine) -> None:
    inspector = inspect(engine)
    _ensure_columns(
        engine,
        inspector,
        "investment_plans",
        {
            "deposit_asset_symbol": "VARCHAR(32)",
            "deposit_amount": "VARCHAR(78)",
            "deposit_value_usd": "VARCHAR(78)",
        },
    )
    _ensure_columns(
        engine,
        inspector,
        "portfolio_snapshots",
        {
            "invested_amount_usd": "VARCHAR(78)",
            "total_deposits_usd": "VARCHAR(78)",
            "total_withdrawals_usd": "VARCHAR(78)",
            "pnl_usd": "VARCHAR(78)",
            "pnl_percent": "VARCHAR(78)",
        },
    )
    _ensure_column_type(
        engine,
        inspector,
        "trade_executions",
        "proposal_id",
        "VARCHAR(66)",
    )
    _ensure_column_type(
        engine,
        inspector,
        "trade_executions",
        "tx_hash",
        "VARCHAR(128)",
    )
    _ensure_column_type(
        engine,
        inspector,
        "trade_executions",
        "failure_reason",
        "TEXT",
    )
    _ensure_columns(
        engine,
        inspector,
        "trade_proposals",
        {
            "approved_by": "VARCHAR(128)",
            "approved_at": "TIMESTAMP WITH TIME ZONE",
            "execution_attempt_count": "INTEGER DEFAULT 0",
            "last_execution_trigger": "VARCHAR(32)",
            "execution_error": "TEXT",
            "retryable": "BOOLEAN DEFAULT true",
        },
    )
    _ensure_columns(
        engine,
        inspector,
        "trade_executions",
        {
            "trigger": "VARCHAR(32)",
        },
    )


def _ensure_columns(engine, inspector, table_name: str, expected_columns: dict[str, str]) -> None:
    try:
        existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
    except Exception:
        return

    missing = {name: definition for name, definition in expected_columns.items() if name not in existing_columns}
    if not missing:
        return

    with engine.begin() as connection:
        for column_name, definition in missing.items():
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"))


def _ensure_column_type(engine, inspector, table_name: str, column_name: str, target_type_sql: str) -> None:
    if engine.dialect.name != "postgresql":
        return
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return

    current = next((column for column in columns if column["name"] == column_name), None)
    if current is None:
        return

    current_type = current.get("type")
    current_type_name = getattr(current_type, "__class__", type(current_type)).__name__.lower()
    if "text" in current_type_name:
        return

    with engine.begin() as connection:
        connection.execute(
            text(f"ALTER TABLE {table_name} ALTER COLUMN {column_name} TYPE {target_type_sql}"),
        )
