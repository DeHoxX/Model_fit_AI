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


def test_settings_loads_root_env_from_apps_api_cwd(monkeypatch: pytest.MonkeyPatch) -> None:
    """Settings must find and load root .env even when instantiated from apps/api/."""
    from pathlib import Path

    root_env = Path(__file__).resolve().parents[3] / ".env"
    if root_env.exists():
        # Remove pytest env overrides to test pure .env loading
        monkeypatch.delenv("DATABASE_URL", raising=False)
        monkeypatch.delenv("APP_ENV", raising=False)
        settings = Settings()
        assert "modelfit_dev_password" in settings.DATABASE_URL
