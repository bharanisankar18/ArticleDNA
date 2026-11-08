from __future__ import annotations

from fastapi import APIRouter, Depends

from config import APP_VERSION, Settings
from routes.deps import get_app_settings, get_gemini_service
from schemas.analysis import HealthResponse
from services.ai_router import AIRouter

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(
    settings: Settings = Depends(get_app_settings),
    gemini: AIRouter = Depends(get_gemini_service),
) -> HealthResponse:
    """Report that the server is up and whether it can reach Gemini (key configured)."""
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        gemini_configured=gemini.configured,
        model=gemini.model,
        providers=gemini.describe(),
        limits={
            "max_content_chars": settings.max_content_chars,
            "min_content_words": settings.min_content_words,
        },
    )
