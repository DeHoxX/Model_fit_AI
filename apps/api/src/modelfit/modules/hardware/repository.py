"""Database repository for hardware profiles."""

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.hardware.models import HardwareProfile


class HardwareRepository:
    """Async database access for hardware profile records."""

    async def list_profiles(self, session: AsyncSession) -> Sequence[HardwareProfile]:
        """Returns all registered hardware profiles ordered by name."""
        stmt = select(HardwareProfile).order_by(HardwareProfile.name.asc())
        result = await session.execute(stmt)
        return result.scalars().all()

    async def get_by_id(
        self, session: AsyncSession, profile_id: uuid.UUID
    ) -> HardwareProfile | None:
        """Finds a hardware profile by primary key UUID."""
        stmt = select(HardwareProfile).where(HardwareProfile.id == profile_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_name(self, session: AsyncSession, name: str) -> HardwareProfile | None:
        """Finds a hardware profile by unique name."""
        stmt = select(HardwareProfile).where(HardwareProfile.name == name)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def seed_presets(self, session: AsyncSession, presets: list[dict[str, Any]]) -> int:
        """Idempotently seeds presets by unique name.

        Inserts new profiles and updates existing ones to ensure seed synchronization.
        """
        count = 0
        for data in presets:
            stmt = select(HardwareProfile).where(HardwareProfile.name == data["name"])
            res = await session.execute(stmt)
            existing = res.scalar_one_or_none()
            if existing:
                existing.memory_bytes = data["memory_bytes"]
                existing.kind = data.get("kind", "gpu")
                existing.reserved_memory_bytes = data.get("reserved_memory_bytes", 0)
                existing.source_url = data.get("source_url")
                existing.is_verified = data.get("is_verified", False)
                existing.notes = data.get("notes")
            else:
                profile = HardwareProfile(
                    name=data["name"],
                    kind=data.get("kind", "gpu"),
                    memory_bytes=data["memory_bytes"],
                    reserved_memory_bytes=data.get("reserved_memory_bytes", 0),
                    source_url=data.get("source_url"),
                    is_verified=data.get("is_verified", False),
                    notes=data.get("notes"),
                )
                session.add(profile)
            count += 1
        await session.commit()
        return count
