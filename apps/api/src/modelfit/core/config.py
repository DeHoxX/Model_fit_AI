"""Application settings with strict validation."""

from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly typed application settings loaded from environment."""

    APP_ENV: Literal["development", "test", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    GIT_SHA: str = "development"
    LOG_LEVEL: str = "INFO"
    API_PORT: int = 8000

    DATABASE_URL: str = "sqlite+aiosqlite:///./modelfit.db"
    TEST_DATABASE_URL: str | None = None

    # Comma-separated or list of allowed origins
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    HF_TOKEN: str | None = None
    LLM_PROVIDER: Literal["gemini", "groq"] = "gemini"
    LLM_API_KEY: str | None = None
    LLM_API_KEYS: str | None = None
    LLM_MODEL: str | None = None
    LLM_CONNECT_TIMEOUT_SECONDS: float = 5.0
    LLM_READ_TIMEOUT_SECONDS: float = 15.0
    ADMIN_TOKEN: str | None = None

    model_config = SettingsConfigDict(
        env_file=("../../.env", "../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: str) -> str:
        return v.strip()

    @property
    def llm_api_key_list(self) -> list[SecretStr]:
        """Returns parsed, stripped, non-empty, de-duplicated SecretStr list."""
        keys: list[SecretStr] = []
        seen: set[str] = set()
        if self.LLM_API_KEYS:
            for raw in self.LLM_API_KEYS.split(","):
                k = raw.strip()
                if k and k not in seen:
                    seen.add(k)
                    keys.append(SecretStr(k))
        elif self.LLM_API_KEY:
            k = self.LLM_API_KEY.strip()
            if k and k not in seen:
                seen.add(k)
                keys.append(SecretStr(k))
        return keys

    def validate_llm_credentials(self) -> None:
        """Validates that required LLM provider credentials and model are configured."""
        if not self.LLM_MODEL:
            raise ValueError(
                "LLM_MODEL is required in development and production modes. "
                "Please configure LLM_MODEL in your environment."
            )
        if self.LLM_PROVIDER == "groq" and len(self.llm_api_key_list) == 0:
            raise ValueError(
                "At least one Groq API key is required when LLM_PROVIDER=groq. "
                "Please configure LLM_API_KEYS or LLM_API_KEY in your environment."
            )
        if self.LLM_PROVIDER == "gemini" and not self.LLM_API_KEY:
            raise ValueError(
                "LLM_API_KEY is required when LLM_PROVIDER=gemini. "
                "Please configure LLM_API_KEY in your environment."
            )

    @model_validator(mode="after")
    def validate_settings(self) -> "Settings":
        """In production, CORS_ORIGINS must never contain a wildcard."""
        if self.APP_ENV == "production":
            origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
            if "*" in origins:
                raise ValueError("CORS_ORIGINS must not contain wildcard '*' in production mode.")

        # In dev and prod, fail fast if LLM provider has no keys or no model
        if self.APP_ENV != "test":
            self.validate_llm_credentials()
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
