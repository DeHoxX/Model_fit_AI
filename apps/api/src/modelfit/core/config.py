"""Application settings with strict validation."""

from typing import Literal
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly typed application settings loaded from environment."""

    APP_ENV: Literal["development", "test", "production"] = "development"
    APP_VERSION: str = "1.0.0"
    GIT_SHA: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://modelfit:modelfit@localhost:5432/modelfit"
    TEST_DATABASE_URL: str | None = None

    # Comma-separated or list of allowed origins
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    HF_TOKEN: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    ADMIN_TOKEN: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS")
    @classmethod
    def validate_cors_origins(cls, v: str) -> str:
        return v.strip()

    @model_validator(mode="after")
    def validate_production_cors(self) -> "Settings":
        """In production, CORS_ORIGINS must never contain a wildcard."""
        if self.APP_ENV == "production":
            origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
            if "*" in origins:
                raise ValueError("CORS_ORIGINS must not contain wildcard '*' in production mode.")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
