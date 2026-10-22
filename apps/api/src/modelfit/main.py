"""FastAPI application factory and lifecycle management."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from modelfit.core.config import settings
from modelfit.core.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_error_handler,
)
from modelfit.core.logging import setup_logging
from modelfit.core.middleware import (
    RequestIDAndLoggingMiddleware,
    SecurityHeadersMiddleware,
)
from modelfit.db.session import close_db
from modelfit.modules.health.router import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan for clean startup and resource cleanup."""
    setup_logging(settings.LOG_LEVEL)
    yield
    await close_db()


def create_app() -> FastAPI:
    """Builds and configures the FastAPI application instance."""
    is_prod = settings.APP_ENV == "production"

    app = FastAPI(
        title="ModelFit API",
        version=settings.APP_VERSION,
        docs_url=None if is_prod else "/docs",
        redoc_url=None if is_prod else "/redoc",
        openapi_url=None if is_prod else "/openapi.json",
        lifespan=lifespan,
    )

    # 1. Security Headers Middleware
    app.add_middleware(SecurityHeadersMiddleware)

    # 2. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["*"],
    )

    # 3. Request-ID & Structlog Middleware
    app.add_middleware(RequestIDAndLoggingMiddleware)

    # 4. Global Exception Handlers
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # 5. Routers mounted under /api/v1
    app.include_router(health_router, prefix="/api/v1")

    return app


app = create_app()
