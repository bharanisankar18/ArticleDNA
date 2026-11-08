from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request

from config import Settings
from routes.analyze import ERROR_RESPONSES
from routes.deps import get_app_settings, get_gemini_service
from routes.validation import check_content
from schemas.article import AnalyzeRequest
from schemas.visual import VisualizeResponse, VisualMeta
from services.analysis_builder import build_visual
from services.errors import AppError
from services.ai_router import AIRouter

router = APIRouter(tags=["visualize"])
logger = logging.getLogger("articledna.visualize")


@router.post("/visualize", response_model=VisualizeResponse, responses=ERROR_RESPONSES)
async def visualize(
    payload: AnalyzeRequest,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    gemini: AIRouter = Depends(get_gemini_service),
) -> VisualizeResponse:
    """Build a workflow diagram and a knowledge graph of one article."""
    check_content(payload, settings)
    started = time.perf_counter()
    raw, model = await gemini.visualize(payload)
    visual = build_visual(raw, payload.content)
    if not visual.workflow and not visual.nodes:
        raise AppError(422, "NOT_AN_ARTICLE", "Gemini couldn't find enough structure in this page to draw diagrams.")
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info(
        "visualization complete",
        extra={
            "request_id": getattr(request.state, "request_id", None),
            "model": model,
            "duration_ms": elapsed_ms,
            "steps": len(visual.workflow),
            "nodes": len(visual.nodes),
            "edges": len(visual.edges),
        },
    )
    return VisualizeResponse(
        visual=visual,
        meta=VisualMeta(model=model, generated_at=datetime.now(timezone.utc), processing_ms=elapsed_ms),
    )
