"""In-process sliding-window rate limiter for Hugging Face proxy endpoints."""

import math
import time
from collections import defaultdict
from collections.abc import Callable

from fastapi import Request

from modelfit.core.errors import AppError


class SlidingWindowRateLimiter:
    """In-memory thread-safe rate limiter tracking requests per client within a rolling window."""

    def __init__(self, max_requests: int = 30, window_seconds: float = 60.0) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._client_timestamps: dict[str, list[float]] = defaultdict(list)

    def check(self, client_key: str) -> None:
        """Checks if client exceeded rate limit. Raises 429 RATE_LIMITED with Retry-After if so."""
        now = time.monotonic()
        timestamps = self._client_timestamps[client_key]

        # Prune timestamps older than window
        cutoff = now - self.window_seconds
        valid_timestamps = [t for t in timestamps if t > cutoff]
        self._client_timestamps[client_key] = valid_timestamps

        if len(valid_timestamps) >= self.max_requests:
            oldest = valid_timestamps[0]
            retry_after = max(1, math.ceil((oldest + self.window_seconds) - now))
            raise AppError(
                code="RATE_LIMITED",
                message=f"Rate limit exceeded. Please retry after {retry_after} seconds.",
                status_code=429,
                details={"retry_after": retry_after, "limit": self.max_requests},
                headers={"Retry-After": str(retry_after)},
            )

        valid_timestamps.append(now)

    def reset(self) -> None:
        """Clears all stored rate limit history (useful for test resets)."""
        self._client_timestamps.clear()


# Default limiter: 30 requests per 60 seconds
catalog_rate_limiter = SlidingWindowRateLimiter(max_requests=30, window_seconds=60.0)


def rate_limit_dependency(
    limiter: SlidingWindowRateLimiter = catalog_rate_limiter,
) -> Callable[[Request], None]:
    """FastAPI dependency to enforce rate limiting by client IP."""

    def dependency(request: Request) -> None:
        client_host = request.client.host if request.client else "unknown"
        limiter.check(client_host)

    return dependency
