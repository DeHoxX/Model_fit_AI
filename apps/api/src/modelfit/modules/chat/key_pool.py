"""KeyPool: Round-robin API key selection with process-lifetime cooldown and disable states.

State notes:
- Key cooldown and disabled states are held in memory per-process and reset upon process restart.
- Thread-safe / task-safe key selection is guarded by an asyncio.Lock.
"""

import asyncio
import time
from dataclasses import dataclass
from typing import Literal

import structlog
from pydantic import SecretStr

logger = structlog.get_logger(__name__)

DEFAULT_COOLDOWN_SECONDS: float = 10.0


class AllKeysCoolingError(Exception):
    """Raised when all configured API keys are cooling down from rate limits."""

    def __init__(self, wait_seconds: float) -> None:
        self.wait_seconds = max(0.0, wait_seconds)
        super().__init__(
            f"All LLM API keys are currently in cooldown. Shortest wait: {self.wait_seconds:.1f}s"
        )


class AllKeysDisabledError(Exception):
    """Raised when all configured API keys have been disabled (e.g. 401 Unauthorized)."""

    def __init__(self) -> None:
        super().__init__("All configured LLM API keys are disabled.")


@dataclass
class KeyEntry:
    index: int
    key: SecretStr
    status: Literal["active", "cooling", "disabled"] = "active"
    cooldown_until: float | None = None


class KeyPool:
    """Manages rotation, cooldowns, and disabling of API keys."""

    def __init__(self, keys: list[SecretStr]) -> None:
        if not keys:
            raise ValueError("KeyPool requires at least one API key.")
        self._entries: list[KeyEntry] = [
            KeyEntry(index=i, key=k, status="active", cooldown_until=None)
            for i, k in enumerate(keys)
        ]
        self._current_idx: int = 0
        self._lock = asyncio.Lock()

    @property
    def total_keys(self) -> int:
        return len(self._entries)

    async def get_next_key(self) -> tuple[int, SecretStr]:
        """Selects the next available active key in round-robin order under an asyncio.Lock."""
        async with self._lock:
            now = time.monotonic()
            # 1. Update any cooling keys whose cooldown period has expired
            for entry in self._entries:
                if (
                    entry.status == "cooling"
                    and entry.cooldown_until is not None
                    and now >= entry.cooldown_until
                ):
                    entry.status = "active"
                    entry.cooldown_until = None
                    logger.info("llm_key_cooldown_expired", key_index=entry.index)

            # 2. Check if all keys are disabled
            all_disabled = all(e.status == "disabled" for e in self._entries)
            if all_disabled:
                raise AllKeysDisabledError()

            # 3. Try to find the next active key starting from current_idx
            n = len(self._entries)
            for _ in range(n):
                idx = self._current_idx
                self._current_idx = (self._current_idx + 1) % n
                candidate = self._entries[idx]
                if candidate.status == "active":
                    return candidate.index, candidate.key

            # 4. If no active key was found, all non-disabled keys must be cooling
            cooling_entries = [
                e for e in self._entries if e.status == "cooling" and e.cooldown_until is not None
            ]
            if cooling_entries:
                shortest_wait = min(
                    max(0.0, e.cooldown_until - now)
                    for e in cooling_entries
                    if e.cooldown_until is not None
                )
                raise AllKeysCoolingError(wait_seconds=shortest_wait)

            raise AllKeysDisabledError()

    async def report_429(self, key_index: int, retry_after: float | None = None) -> None:
        """Marks key as cooling for the specified retry_after duration (default 10.0s)."""
        async with self._lock:
            if 0 <= key_index < len(self._entries):
                entry = self._entries[key_index]
                if entry.status != "disabled":
                    cooldown = (
                        retry_after
                        if (retry_after is not None and retry_after > 0)
                        else DEFAULT_COOLDOWN_SECONDS
                    )
                    entry.status = "cooling"
                    entry.cooldown_until = time.monotonic() + cooldown
                    logger.warning(
                        "llm_key_rate_limited",
                        key_index=key_index,
                        cooldown_seconds=cooldown,
                    )

    async def report_401(self, key_index: int) -> None:
        """Permanently disables key for the process lifetime on 401 Unauthorized."""
        async with self._lock:
            if 0 <= key_index < len(self._entries):
                entry = self._entries[key_index]
                entry.status = "disabled"
                entry.cooldown_until = None
                logger.warning("llm_key_disabled_401", key_index=key_index)
