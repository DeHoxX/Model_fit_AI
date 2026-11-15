"""Async database engine and session management."""

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from modelfit.core.config import settings

engine: AsyncEngine | None = None
async_session_maker: async_sessionmaker[AsyncSession] | None = None


def setup_sqlite_pragmas(async_engine: AsyncEngine) -> None:
    """Configures SQLite PRAGMAs (WAL, foreign keys, busy timeout) on every connection."""

    @event.listens_for(async_engine.sync_engine, "connect")
    def set_sqlite_pragmas(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


def get_engine() -> AsyncEngine:
    global engine, async_session_maker
    if engine is None:
        db_url = settings.DATABASE_URL
        # In sqlite testing or postgres, pool size parameters vary
        connect_args = {}
        if "sqlite" in db_url:
            connect_args = {"check_same_thread": False}

        engine = create_async_engine(
            db_url,
            echo=False,
            future=True,
            connect_args=connect_args,
        )
        if "sqlite" in db_url:
            setup_sqlite_pragmas(engine)
        async_session_maker = async_sessionmaker(
            bind=engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return engine


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert async_session_maker is not None
    return async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for injecting an async database session."""
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def close_db() -> None:
    """Cleanly close database engine pools on application shutdown."""
    global engine, async_session_maker
    if engine is not None:
        await engine.dispose()
        engine = None
        async_session_maker = None
