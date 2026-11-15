"""Structured JSON logging with structlog."""

import logging
import sys

import structlog


def setup_logging(log_level: str = "INFO") -> None:
    """Configures structured JSON logging with contextvars propagation."""
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Standard library root logging configuration
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    # Silence verbose HTTP logs containing URLs and query parameters
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger()
