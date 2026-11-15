"""Tests for settings validation and production CORS rejection."""

import pytest
from pydantic import ValidationError

from modelfit.core.config import Settings


def test_default_settings() -> None:
    settings = Settings()
    assert settings.APP_ENV in ["development", "test", "production"]
    assert len(settings.cors_origin_list) >= 1
    assert settings.API_PORT == 8000


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
        assert "sqlite+aiosqlite:" in settings.DATABASE_URL
        assert "modelfit.db" in settings.DATABASE_URL


def test_llm_api_keys_trim_dedup_and_fallback() -> None:
    """Verifies that LLM_API_KEYS trims spaces, drops empty tokens, and deduplicates."""
    s = Settings(
        APP_ENV="test",
        LLM_API_KEYS=" key_1 , key_2, , key_1 , key_3  ",
    )
    raw_keys = [k.get_secret_value() for k in s.llm_api_key_list]
    assert raw_keys == ["key_1", "key_2", "key_3"]

    # Fallback to single LLM_API_KEY
    s_single = Settings(
        APP_ENV="test",
        LLM_API_KEY="  single_key  ",
        LLM_API_KEYS=None,
    )
    assert [k.get_secret_value() for k in s_single.llm_api_key_list] == ["single_key"]


def test_llm_settings_fail_fast_validation() -> None:
    """In development/production mode, missing model or keys must fail fast at startup."""
    # Missing model
    with pytest.raises(ValidationError) as exc:
        Settings(
            APP_ENV="development",
            LLM_PROVIDER="groq",
            LLM_API_KEYS="key_1",
            LLM_MODEL=None,
        )
    assert "LLM_MODEL is required" in str(exc.value)

    # Groq with no keys
    with pytest.raises(ValidationError) as exc:
        Settings(
            APP_ENV="development",
            LLM_PROVIDER="groq",
            LLM_API_KEYS="  ,  ",
            LLM_API_KEY=None,
            LLM_MODEL="llama-3.3-70b-versatile",
        )
    assert "At least one Groq API key is required" in str(exc.value)

    # Gemini with no key
    with pytest.raises(ValidationError) as exc:
        Settings(
            APP_ENV="development",
            LLM_PROVIDER="gemini",
            LLM_API_KEY=None,
            LLM_MODEL="gemini-2.5-flash",
        )
    assert "LLM_API_KEY is required" in str(exc.value)


def test_llm_credentials_validation_matrix_in_development() -> None:
    """Verifies provider-aware credential rules in APP_ENV=development.

    Matrix:
    - groq with only LLM_API_KEYS passes
    - groq with only LLM_API_KEY passes
    - groq with neither fails
    - gemini with only LLM_API_KEYS fails
    - gemini with LLM_API_KEY passes
    """
    # 1. groq with only LLM_API_KEYS passes
    s_groq_keys = Settings(
        APP_ENV="development",
        LLM_PROVIDER="groq",
        LLM_API_KEYS="gsk_key_1, gsk_key_2",
        LLM_API_KEY=None,
        LLM_MODEL="llama-3.3-70b-versatile",
    )
    assert len(s_groq_keys.llm_api_key_list) == 2
    s_groq_keys.validate_llm_credentials()

    # 2. groq with only LLM_API_KEY passes
    s_groq_single = Settings(
        APP_ENV="development",
        LLM_PROVIDER="groq",
        LLM_API_KEYS=None,
        LLM_API_KEY="gsk_single_key",
        LLM_MODEL="llama-3.3-70b-versatile",
    )
    assert len(s_groq_single.llm_api_key_list) == 1
    s_groq_single.validate_llm_credentials()

    # 3. groq with neither fails
    with pytest.raises(ValidationError) as exc_groq_none:
        Settings(
            APP_ENV="development",
            LLM_PROVIDER="groq",
            LLM_API_KEYS=None,
            LLM_API_KEY=None,
            LLM_MODEL="llama-3.3-70b-versatile",
        )
    assert "At least one Groq API key is required" in str(exc_groq_none.value)

    # 4. gemini with only LLM_API_KEYS fails
    with pytest.raises(ValidationError) as exc_gemini_keys:
        Settings(
            APP_ENV="development",
            LLM_PROVIDER="gemini",
            LLM_API_KEYS="some_groq_key",
            LLM_API_KEY=None,
            LLM_MODEL="gemini-2.5-flash",
        )
    assert "LLM_API_KEY is required when LLM_PROVIDER=gemini" in str(exc_gemini_keys.value)

    # 5. gemini with LLM_API_KEY passes
    s_gemini = Settings(
        APP_ENV="development",
        LLM_PROVIDER="gemini",
        LLM_API_KEYS=None,
        LLM_API_KEY="valid_gemini_key",
        LLM_MODEL="gemini-2.5-flash",
    )
    assert s_gemini.LLM_API_KEY == "valid_gemini_key"
    s_gemini.validate_llm_credentials()


@pytest.mark.asyncio
async def test_main_lifespan_startup_validation_groq_with_api_keys(
    monkeypatch: pytest.MonkeyPatch,
    prepare_database: None,
) -> None:
    """Verifies that main.py lifespan startup accepts valid Groq config with LLM_API_KEYS."""
    from modelfit.core.config import settings
    from modelfit.main import create_app, lifespan
    from tests.conftest import TestSessionLocal

    # Mock settings to simulate development mode with Groq and LLM_API_KEYS
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "LLM_PROVIDER", "groq")
    monkeypatch.setattr(settings, "LLM_API_KEYS", "gsk_key_1, gsk_key_2")
    monkeypatch.setattr(settings, "LLM_API_KEY", None)
    monkeypatch.setattr(settings, "LLM_MODEL", "llama-3.3-70b-versatile")

    # Connect lifespan hardware seeding to the prepared test database
    monkeypatch.setattr("modelfit.db.session.get_session_maker", lambda: TestSessionLocal)

    app = create_app()
    # The lifespan context manager should not raise any credential exception
    async with lifespan(app):
        pass
