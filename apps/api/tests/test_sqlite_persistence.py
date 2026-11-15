"""Tests for SQLite persistence, UTC timestamps, and cache expiration."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from modelfit.db.session import setup_sqlite_pragmas
from modelfit.modules.catalog.models import ModelCache
from modelfit.modules.hardware.models import HardwareProfile


@pytest.mark.asyncio
async def test_created_at_updated_at_timezone_aware_utc_and_changes_on_update(
    db_session: AsyncSession,
) -> None:
    """Test that created_at and updated_at come back timezone-aware UTC,

    and updated_at changes on update.
    """
    profile = HardwareProfile(
        id=uuid.uuid4(),
        name="NVIDIA RTX 4090 Test",
        kind="gpu",
        memory_bytes=24 * 1024 * 1024 * 1024,
        reserved_memory_bytes=1024 * 1024 * 1024,
        is_verified=True,
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    # 1. Assert created_at and updated_at are timezone-aware UTC
    assert profile.created_at.tzinfo is not None, "created_at must be timezone-aware"
    assert profile.created_at.tzinfo == UTC, "created_at must have UTC tzinfo"
    assert profile.updated_at.tzinfo is not None, "updated_at must be timezone-aware"
    assert profile.updated_at.tzinfo == UTC, "updated_at must have UTC tzinfo"

    initial_created_at = profile.created_at
    initial_updated_at = profile.updated_at

    # Small delay to ensure timestamp difference
    await asyncio.sleep(0.02)

    # 2. Update a field and assert updated_at changes
    profile.notes = "Updated notes for hardware"
    await db_session.commit()
    await db_session.refresh(profile)

    assert profile.created_at == initial_created_at
    assert profile.updated_at > initial_updated_at
    assert profile.updated_at.tzinfo == UTC


@pytest.mark.asyncio
async def test_expired_rows_count_as_stale_under_sqlite(db_session: AsyncSession) -> None:
    """Test that expired rows in model_cache count as stale under SQLite."""
    now = datetime.now(UTC)
    expired_time = now - timedelta(seconds=10)
    future_time = now + timedelta(hours=24)

    expired_model = ModelCache(
        hf_model_id="test-org/expired-model",
        author="test-org",
        model_name="expired-model",
        pipeline_tag="text-generation",
        fetched_at=now - timedelta(hours=48),
        expires_at=expired_time,
        raw_config={"architectures": ["LlamaForCausalLM"]},
        normalized_payload={"architecture": "LlamaForCausalLM"},
    )
    valid_model = ModelCache(
        hf_model_id="test-org/valid-model",
        author="test-org",
        model_name="valid-model",
        pipeline_tag="text-generation",
        fetched_at=now,
        expires_at=future_time,
        raw_config={"architectures": ["LlamaForCausalLM"]},
        normalized_payload={"architecture": "LlamaForCausalLM"},
    )
    db_session.add_all([expired_model, valid_model])
    await db_session.commit()

    # Query rows that are stale (expires_at <= now)
    stale_stmt = select(ModelCache).where(ModelCache.expires_at <= datetime.now(UTC))
    stale_results = (await db_session.execute(stale_stmt)).scalars().all()
    stale_ids = [m.hf_model_id for m in stale_results]

    assert "test-org/expired-model" in stale_ids
    assert "test-org/valid-model" not in stale_ids

    # Query active/valid rows (expires_at > now)
    valid_stmt = select(ModelCache).where(ModelCache.expires_at > datetime.now(UTC))
    valid_results = (await db_session.execute(valid_stmt)).scalars().all()
    valid_ids = [m.hf_model_id for m in valid_results]

    assert "test-org/valid-model" in valid_ids
    assert "test-org/expired-model" not in valid_ids


@pytest.mark.asyncio
async def test_sqlite_pragmas_foreign_keys_and_busy_timeout(db_session: AsyncSession) -> None:
    """Verifies that SQLite PRAGMAs foreign_keys==1 and busy_timeout==5000 are active."""
    fk_result = await db_session.execute(text("PRAGMA foreign_keys;"))
    assert fk_result.scalar() == 1

    bt_result = await db_session.execute(text("PRAGMA busy_timeout;"))
    assert bt_result.scalar() == 5000


@pytest.mark.asyncio
async def test_sqlite_pragmas_wal_journal_mode_on_file_db(tmp_path: Path) -> None:
    """Verifies that SQLite journal_mode == 'wal' is set on file-backed SQLite databases."""
    db_file = tmp_path / "test_wal_pragmas.db"
    file_engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"check_same_thread": False},
    )
    setup_sqlite_pragmas(file_engine)

    try:
        async with file_engine.connect() as conn:
            jm_result = await conn.execute(text("PRAGMA journal_mode;"))
            mode = jm_result.scalar()
            assert mode is not None and mode.lower() == "wal"
    finally:
        await file_engine.dispose()
