"""Tests for settings validation and production CORS rejection."""

import pytest
from pydantic import ValidationError
from modelfit.core.config import Settings


def test_default_settings() -> None:
    settings = Settings()
    assert settings.APP_ENV in ["development", "test", "production"]
    assert len(settings.cors_origin_list) >= 1


def test_production_rejects_wildcard_cors() -> None:
    """Production mode must refuse to instantiate if CORS_ORIGINS contains '*'."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            APP_ENV="production",
            CORS_ORIGINS="http://localhost:3000, *, https://example.com",
        )
    assert "CORS_ORIGINS must not contain wildcard '*' in production mode" in str(exc_info.value)


def test_production_accepts_valid_origins() -> None:
    settings = Settings(
        APP_ENV="production",
        CORS_ORIGINS="https://modelfit.example.com, https://app.example.com",
    )
    assert settings.cors_origin_list == [
        "https://modelfit.example.com",
        "https://app.example.com",
    ]
