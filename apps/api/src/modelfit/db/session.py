"""Async database engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from modelfit.core.config import settings

engine: AsyncEngine | None = None
async_session_maker: async_sessionmaker[AsyncSession] | None = None


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
