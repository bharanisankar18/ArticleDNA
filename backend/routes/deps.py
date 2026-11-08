"""FastAPI dependencies, resolved from app state so tests can swap implementations."""
from __future__ import annotations

from fastapi import Request

from config import Settings
from services.ai_router import AIRouter


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_gemini_service(request: Request) -> AIRouter:
    return request.app.state.gemini
