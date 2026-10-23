"""Real PostgreSQL migration and schema reflection drift test.

Runs against TEST_DATABASE_URL on real PostgreSQL in Docker.
Ensures:
1. Complete migration chain upgrade from scratch on a clean scratch database (modelfit_test).
2. Strict schema alignment: zero autogenerate diff between reflected schema and Base.metadata.
3. Reversible one-step downgrade and re-upgrade.
4. Never touches the dev database 'modelfit'.
"""

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

# Ensure all ORM models are imported so Base.metadata is fully populated
import modelfit.modules.catalog.models  # noqa: F401
import modelfit.modules.hardware.models  # noqa: F401
from alembic import command
from modelfit.core.config import settings
from modelfit.db.base import Base


def get_postgres_test_async_urls() -> tuple[str, str]:
    """Returns (admin_async_url, test_async_url) from TEST_DATABASE_URL."""
    test_url = settings.TEST_DATABASE_URL
    if not test_url:
        pytest.fail("TEST_DATABASE_URL is not configured in settings or .env")

    if not test_url.startswith("postgresql"):
        pytest.fail(f"TEST_DATABASE_URL must be a PostgreSQL connection, got: {test_url}")

    if not test_url.startswith("postgresql+asyncpg://"):
        test_url = test_url.replace("postgresql://", "postgresql+asyncpg://")

    # Admin URL points to 'postgres' system database on same host/port/auth
    parts = test_url.rsplit("/", 1)
    admin_async_url = f"{parts[0]}/postgres"
    return admin_async_url, test_url


@pytest.fixture(scope="module")
async def postgres_test_db() -> AsyncGenerator[AsyncEngine, None]:
    """Sets up a pristine scratch database 'modelfit_test' on real PostgreSQL."""
    admin_url, test_url = get_postgres_test_async_urls()

    # 1. Connect to admin DB and create pristine modelfit_test
    try:
        admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
        async with admin_engine.connect() as conn:
            # Terminate any lingering connections to modelfit_test
            await conn.execute(
                sa.text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = 'modelfit_test' AND pid <> pg_backend_pid();"
                )
            )
            await conn.execute(sa.text("DROP DATABASE IF EXISTS modelfit_test;"))
            await conn.execute(sa.text("CREATE DATABASE modelfit_test;"))
        await admin_engine.dispose()
    except Exception as exc:
        pytest.fail(
            f"Could not connect to PostgreSQL on {admin_url}. Is PostgreSQL running? Error: {exc}"
        )

    test_engine = create_async_engine(test_url)
    try:
        yield test_engine
    finally:
        await test_engine.dispose()
        # Clean up scratch database after tests
        try:
            admin_engine = create_async_engine(admin_url, isolation_level="AUTOCOMMIT")
            async with admin_engine.connect() as conn:
                await conn.execute(
                    sa.text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = 'modelfit_test' AND pid <> pg_backend_pid();"
                    )
                )
                await conn.execute(sa.text("DROP DATABASE IF EXISTS modelfit_test;"))
            await admin_engine.dispose()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_postgres_schema_matches_orm_metadata(postgres_test_db: AsyncEngine) -> None:
    """Alembic upgrade head on Postgres must produce schema matching Base.metadata."""

    _, test_url = get_postgres_test_async_urls()
    api_dir = Path(__file__).resolve().parent.parent
    ini_path = api_dir / "alembic.ini"

    alembic_cfg = Config(str(ini_path))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_url)

    # 1. Upgrade from empty to head on scratch DB using async engine
    def do_upgrade(conn: sa.Connection) -> None:
        alembic_cfg.attributes["connection"] = conn
        command.upgrade(alembic_cfg, "head")

    async with postgres_test_db.connect() as conn:
        await conn.run_sync(do_upgrade)

    # 2. Compare reflected PostgreSQL schema against Base.metadata
    def do_compare(conn: sa.Connection) -> list[object]:
        ctx = MigrationContext.configure(
            conn,
            opts={"compare_type": True, "compare_server_default": True},
        )
        return compare_metadata(ctx, Base.metadata)

    async with postgres_test_db.connect() as conn:
        diff = await conn.run_sync(do_compare)
        # Assert no schema drift
        assert diff == [], (
            f"Schema drift detected between Alembic migrations and ORM models: {diff}"
        )

    # 3. Test reversible downgrade-one-step
    def do_downgrade(conn: sa.Connection) -> None:
        alembic_cfg.attributes["connection"] = conn
        command.downgrade(alembic_cfg, "-1")

    async with postgres_test_db.connect() as conn:
        await conn.run_sync(do_downgrade)
