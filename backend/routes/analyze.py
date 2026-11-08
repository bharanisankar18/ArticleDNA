from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from config import Settings
from routes.deps import get_app_settings, get_gemini_service
from routes.validation import check_content
from schemas.analysis import AnalysisMeta, AnalyzeResponse, ErrorResponse
from schemas.article import AnalyzeRequest
from services.analysis_builder import build_analysis
from services.errors import AppError
from services.ai_router import AIRouter

router = APIRouter(tags=["analysis"])
logger = logging.getLogger("articledna.analyze")

ERROR_RESPONSES = {status: {"model": ErrorResponse} for status in (413, 422, 429, 502, 503, 504)}


@router.post("/analyze", response_model=AnalyzeResponse, responses=ERROR_RESPONSES)
async def analyze(
    payload: AnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    gemini: AIRouter = Depends(get_gemini_service),
) -> AnalyzeResponse:
    """Analyze one article's text with Gemini and return the structured ArticleDNA breakdown."""
    words = check_content(payload, settings)
    started = time.perf_counter()
    raw, model = await gemini.analyze(payload)
    if not raw.content_assessment.is_analyzable:
        note = raw.content_assessment.note.strip() or "The page doesn't contain a substantive article."
        raise AppError(422, "NOT_AN_ARTICLE", f"This page can't be analyzed as an article. {note}")

    analysis, excerpts_total, excerpts_verified = build_analysis(raw, payload.content)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "analysis complete",
        extra={
            "request_id": getattr(request.state, "request_id", None),
            "model": model,
            "input_chars": len(payload.content),
            "duration_ms": elapsed_ms,
            "excerpts_total": excerpts_total,
            "excerpts_verified": excerpts_verified,
        },
    )
    return AnalyzeResponse(
        analysis=analysis,
        meta=AnalysisMeta(
            model=model,
            analyzed_at=datetime.now(timezone.utc),
            processing_ms=elapsed_ms,
            input_chars=len(payload.content),
            input_words=words,
            excerpts_total=excerpts_total,
            excerpts_verified=excerpts_verified,
        ),
    )
