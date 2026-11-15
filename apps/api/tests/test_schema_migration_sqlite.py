"""SQLite migration and schema reflection drift test.

Runs against a clean scratch SQLite file.
Ensures:
1. Complete migration chain upgrade from scratch on a clean scratch database.
2. Strict schema alignment: zero autogenerate diff between reflected schema and Base.metadata.
3. Reversible one-step downgrade and re-upgrade.
"""

from collections.abc import AsyncGenerator
from pathlib import Path
from typing import cast

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
from modelfit.db.base import Base


@pytest.fixture
async def sqlite_test_db(tmp_path: Path) -> AsyncGenerator[tuple[AsyncEngine, str], None]:
    """Sets up a pristine scratch database on SQLite."""
    db_file = tmp_path / "scratch_migration_test.db"
    test_url = f"sqlite+aiosqlite:///{db_file}"
    test_engine = create_async_engine(test_url)
    try:
        yield test_engine, test_url
    finally:
        await test_engine.dispose()
        if db_file.exists():
            db_file.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_sqlite_schema_matches_orm_metadata(
    sqlite_test_db: tuple[AsyncEngine, str],
) -> None:
    """Alembic upgrade head on SQLite must produce schema matching Base.metadata."""
    engine, test_url = sqlite_test_db
    api_dir = Path(__file__).resolve().parent.parent
    ini_path = api_dir / "alembic.ini"

    alembic_cfg = Config(str(ini_path))
    alembic_cfg.set_main_option("script_location", str(api_dir / "alembic"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_url)

    # 1. Upgrade from empty to head on scratch DB using async engine
    def do_upgrade(conn: sa.Connection) -> None:
        alembic_cfg.attributes["connection"] = conn
        command.upgrade(alembic_cfg, "head")

    async with engine.connect() as conn:
        await conn.run_sync(do_upgrade)

    # 2. Compare reflected SQLite schema against Base.metadata
    def do_compare(conn: sa.Connection) -> list[object]:
        ctx = MigrationContext.configure(
            conn,
            opts={"compare_type": True, "compare_server_default": True},
        )
        return cast(list[object], compare_metadata(ctx, Base.metadata))

    async with engine.connect() as conn:
        diff = await conn.run_sync(do_compare)
        assert diff == [], (
            f"Schema drift detected between Alembic migrations and ORM models: {diff}"
        )

    # 3. Test reversible downgrade-one-step
    def do_downgrade(conn: sa.Connection) -> None:
        alembic_cfg.attributes["connection"] = conn
        command.downgrade(alembic_cfg, "-1")

    async with engine.connect() as conn:
        await conn.run_sync(do_downgrade)

    # 4. Re-upgrade to head
    async with engine.connect() as conn:
        await conn.run_sync(do_upgrade)
