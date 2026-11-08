"""Input checks shared by the analysis and visualization endpoints."""
from __future__ import annotations

from config import Settings
from schemas.article import AnalyzeRequest
from services.errors import AppError
from services.text_tools import count_words


def check_content(payload: AnalyzeRequest, settings: Settings) -> int:
    """Reject content that is too long or too short. Returns the word count."""
    content = payload.content
    if len(content) > settings.max_content_chars:
        raise AppError(
            413,
            "CONTENT_TOO_LONG",
            f"The article text is {len(content):,} characters; the limit is {settings.max_content_chars:,}.",
        )
    words = count_words(content)
    if words < settings.min_content_words:
        raise AppError(
            422,
            "CONTENT_TOO_SHORT",
            f"Only {words} words of readable text were found. At least {settings.min_content_words} are needed.",
        )
    return words
