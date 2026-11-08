"""ArticleDNA API.

Run locally:  uvicorn main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from config import APP_VERSION, Settings, get_settings
from routes import analyze, health, visualize
from services.errors import AppError
from services.ai_router import AIRouter
from services.gemini_service import GeminiService

_STANDARD_LOG_KEYS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


class KeyValueFormatter(logging.Formatter):
    """`time level logger message key=value ...` - readable, greppable, and never includes article text."""

    def format(self, record: logging.LogRecord) -> str:
        base = f"{self.formatTime(record)} {record.levelname:<7} {record.name}: {record.getMessage()}"
        extras = {k: v for k, v in record.__dict__.items() if k not in _STANDARD_LOG_KEYS}
        if extras:
            base += " " + " ".join(f"{k}={v}" for k, v in extras.items())
        if record.exc_info:
            base += "\n" + self.formatException(record.exc_info)
        return base


def _configure_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(KeyValueFormatter())
    root = logging.getLogger("articledna")
    root.handlers = [handler]
    root.setLevel(level.upper())
    root.propagate = False


def _error(status: int, code: str, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content=AppError(status, code, message, **extra).to_body())


def create_app(settings: Settings | None = None, gemini: GeminiService | None = None) -> FastAPI:
    settings = settings or get_settings()
    _configure_logging(settings.log_level)
    log = logging.getLogger("articledna.http")

    app = FastAPI(
        title="ArticleDNA API",
        version=APP_VERSION,
        description="Structured article analysis for the ArticleDNA Chrome extension.",
    )
    app.state.settings = settings
    app.state.gemini = AIRouter(settings, gemini or GeminiService(settings))

    cors = {
        "allow_methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-Request-ID"],
        "expose_headers": ["X-Request-ID", "Retry-After"],
        "max_age": 600,
        # Chrome's Private Network Access preflight for requests to a localhost server.
        "allow_private_network": True,
    }
    if settings.extension_ids:
        cors["allow_origins"] = [f"chrome-extension://{ext_id}" for ext_id in settings.extension_ids]
    else:
        cors["allow_origin_regex"] = r"^chrome-extension://[a-p]{32}$"
    app.add_middleware(CORSMiddleware, **cors)

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex[:16]
        request.state.request_id = request_id
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_request_bytes:
            response = _error(413, "REQUEST_TOO_LARGE", "The request body is too large.")
        else:
            started = time.perf_counter()
            response = await call_next(request)
            if request.url.path != "/api/health":
                log.info(
                    "request",
                    extra={
                        "request_id": request_id,
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "duration_ms": int((time.perf_counter() - started) * 1000),
                    },
                )
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        response = JSONResponse(status_code=exc.status_code, content=exc.to_body())
        if exc.retry_after_seconds:
            response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        problems = []
        for err in exc.errors()[:3]:
            location = ".".join(str(part) for part in err.get("loc", []) if part != "body")
            problems.append(f"{location or 'body'}: {err.get('msg', 'invalid value')}")
        return _error(422, "INVALID_REQUEST", "The request is invalid. " + "; ".join(problems))

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}.get(exc.status_code, "HTTP_ERROR")
        return _error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error", extra={"request_id": getattr(request.state, "request_id", None)})
        return _error(500, "INTERNAL_ERROR", "Something went wrong on the ArticleDNA server.")

    app.include_router(health.router, prefix="/api")
    app.include_router(analyze.router, prefix="/api")
    app.include_router(visualize.router, prefix="/api")
    return app


app = create_app()
