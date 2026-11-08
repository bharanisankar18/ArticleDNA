"""Gemini integration: builds the request, calls the API with retries, and validates the output."""
from __future__ import annotations

import asyncio
import logging
import math
import random
import re
from typing import Any, TypeVar

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from config import Settings
from prompts.analysis_prompt import SYSTEM_INSTRUCTION, VISUAL_SYSTEM_INSTRUCTION, build_user_prompt
from schemas.analysis import GeminiAnalysis
from schemas.article import AnalyzeRequest
from schemas.visual import GeminiVisual
from services.errors import AppError

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger("articledna.gemini")


def _exception_types(*names: str) -> tuple[type[BaseException], ...]:
    """Collect exception classes from httpx and httpx2 (the SDK may use either)."""
    found: list[type[BaseException]] = []
    for module_name in ("httpx", "httpx2"):
        try:
            module = __import__(module_name)
        except ImportError:
            continue
        for name in names:
            exc = getattr(module, name, None)
            if isinstance(exc, type) and issubclass(exc, BaseException):
                found.append(exc)
    return tuple(found)


TIMEOUT_ERRORS = (asyncio.TimeoutError, TimeoutError) + _exception_types("TimeoutException")
NETWORK_ERRORS = _exception_types("TransportError", "NetworkError", "ConnectError")

BLOCKING_FINISH_REASONS = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "BLOCKLIST",
    "SPII",
    "RECITATION",
    "IMAGE_SAFETY",
}
MAX_INLINE_RETRY_WAIT = 10  # seconds we are willing to wait inside one request before giving up
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


def _parse_retry_delay(details: Any) -> int | None:
    """Find a google.rpc.RetryInfo retryDelay (e.g. "33s") anywhere in an error payload."""
    stack = [details]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            delay = item.get("retryDelay")
            if isinstance(delay, str):
                match = re.fullmatch(r"\s*([\d.]+)s\s*", delay)
                if match:
                    return max(1, math.ceil(float(match.group(1))))
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    return None


def _enum_name(value: Any) -> str | None:
    if value is None:
        return None
    return getattr(value, "name", None) or str(value).split(".")[-1]


class GeminiService:
    def __init__(self, settings: Settings, client: Any | None = None, sleep=asyncio.sleep) -> None:
        self._settings = settings
        self._client = client
        self._sleep = sleep
        if self._client is None and settings.gemini_configured:
            self._client = genai.Client(
                api_key=settings.gemini_api_key.strip(),
                http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_seconds * 1000)),
            )
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_analyses)

    name = "gemini"
    label = "Gemini"
    #: Set by the router when other providers can take over, so a busy Gemini fails fast.
    max_retries_override: int | None = None

    @property
    def configured(self) -> bool:
        return self._client is not None

    @property
    def model(self) -> str:
        return self._settings.gemini_model

    @property
    def model_label(self) -> str:
        return self._settings.gemini_model

    @property
    def max_chars(self) -> int:
        return self._settings.max_content_chars

    async def generate(self, system_instruction: str, prompt: str, schema: type[T]) -> T:
        """Provider interface used by the router."""
        if self._client is None:
            raise AppError(503, "GEMINI_NOT_CONFIGURED", "Gemini has no API key (GEMINI_API_KEY).")
        async with self._semaphore:
            return await self._generate_with_retries(prompt, self._config(system_instruction, schema), schema)

    def _config(self, system_instruction: str, schema: type[BaseModel]) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=self._settings.gemini_temperature,
            max_output_tokens=self._settings.gemini_max_output_tokens,
        )

    async def analyze(self, request: AnalyzeRequest) -> GeminiAnalysis:
        """The full ArticleDNA breakdown of one article."""
        return await self._run(request, "Analyze the article below.", SYSTEM_INSTRUCTION, GeminiAnalysis)

    async def visualize(self, request: AnalyzeRequest) -> GeminiVisual:
        """A workflow and knowledge graph of one article."""
        return await self._run(
            request, "Build the workflow and knowledge graph for the article below.", VISUAL_SYSTEM_INSTRUCTION, GeminiVisual
        )

    async def _run(self, request: AnalyzeRequest, task: str, system_instruction: str, schema: type[T]) -> T:
        if self._client is None:
            raise AppError(
                503,
                "GEMINI_NOT_CONFIGURED",
                "The ArticleDNA server has no Gemini API key. Add GEMINI_API_KEY to backend/.env and restart it.",
            )
        prompt = build_user_prompt(
            title=request.title,
            url=request.url,
            content=request.content,
            author=request.author,
            published_date=request.published_date,
            site_name=request.site_name,
            task=task,
        )
        async with self._semaphore:
            return await self._generate_with_retries(prompt, self._config(system_instruction, schema), schema)

    async def _generate_with_retries(self, prompt: str, config: types.GenerateContentConfig, schema: type[T]) -> T:
        retries = self.max_retries_override if self.max_retries_override is not None else self._settings.gemini_max_retries
        attempts = retries + 1
        for attempt in range(attempts):
            last_attempt = attempt == attempts - 1
            try:
                response = await asyncio.wait_for(
                    self._client.aio.models.generate_content(
                        model=self._settings.gemini_model, contents=prompt, config=config
                    ),
                    timeout=self._settings.gemini_timeout_seconds + 5,
                )
                return self._parse(response, schema)
            except AppError as error:  # raised by _parse
                failure = error
            except genai_errors.APIError as error:
                failure = self._map_api_error(error)
            except TIMEOUT_ERRORS:
                # Retrying a request that already ran for the full timeout would make the user wait
                # minutes, so timeouts are reported immediately.
                raise AppError(
                    504,
                    "GEMINI_TIMEOUT",
                    "Gemini took too long to respond. Try again, or analyze a shorter article.",
                    retryable=True,
                ) from None
            except NETWORK_ERRORS:
                failure = AppError(
                    503,
                    "GEMINI_UNREACHABLE",
                    "The ArticleDNA server couldn't reach Gemini. Check the server's internet connection.",
                    retryable=True,
                )

            wait = self._retry_wait(attempt, failure)
            logger.warning(
                "gemini attempt failed",
                extra={"attempt": attempt + 1, "code": failure.code, "retry_in": wait},
            )
            if last_attempt or not failure.retryable or wait is None:
                raise failure
            await self._sleep(wait)
        raise AssertionError("unreachable")  # pragma: no cover

    @staticmethod
    def _retry_wait(attempt: int, failure: AppError) -> float | None:
        if failure.retry_after_seconds is not None:
            if failure.retry_after_seconds > MAX_INLINE_RETRY_WAIT:
                return None  # let the client decide; waiting here would stall the request
            return float(failure.retry_after_seconds)
        return (1.5 * (2**attempt)) + random.uniform(0, 0.5)

    def _parse(self, response: Any, schema: type[T]) -> T:
        feedback = getattr(response, "prompt_feedback", None)
        block_reason = _enum_name(getattr(feedback, "block_reason", None)) if feedback else None
        if block_reason and block_reason != "BLOCKED_REASON_UNSPECIFIED":
            raise AppError(
                422,
                "CONTENT_BLOCKED",
                f"Gemini declined to analyze this content ({block_reason.lower().replace('_', ' ')}).",
            )
        candidates = getattr(response, "candidates", None) or []
        finish = _enum_name(getattr(candidates[0], "finish_reason", None)) if candidates else None
        if finish in BLOCKING_FINISH_REASONS:
            raise AppError(
                422,
                "CONTENT_BLOCKED",
                f"Gemini stopped before finishing the analysis ({finish.lower().replace('_', ' ')}).",
            )

        text = getattr(response, "text", None)
        if not text or not text.strip():
            if finish == "MAX_TOKENS":
                raise AppError(502, "AI_RESPONSE_INCOMPLETE", "Gemini's answer was cut off. Try again.", retryable=True)
            raise AppError(502, "AI_RESPONSE_EMPTY", "Gemini returned an empty answer. Try again.", retryable=True)

        try:
            return schema.model_validate_json(_FENCE.sub("", text))
        except ValidationError as error:
            logger.warning("gemini output failed validation", extra={"errors": error.error_count(), "finish": finish})
            if finish == "MAX_TOKENS":
                raise AppError(
                    502, "AI_RESPONSE_INCOMPLETE", "Gemini's answer was cut off before it finished. Try again.", retryable=True
                ) from None
            raise AppError(
                502,
                "AI_RESPONSE_INVALID",
                "Gemini returned an analysis in an unexpected format. Try again.",
                retryable=True,
            ) from None

    def _map_api_error(self, error: genai_errors.APIError) -> AppError:
        code = getattr(error, "code", None) or 0
        status = (getattr(error, "status", None) or "").upper()
        message = str(getattr(error, "message", None) or "")
        if code == 429 or status == "RESOURCE_EXHAUSTED":
            return AppError(
                429,
                "RATE_LIMITED",
                "Gemini's rate limit was reached. Wait a moment, then try again.",
                retryable=True,
                retry_after_seconds=_parse_retry_delay(getattr(error, "details", None)),
            )
        if code in (401, 403) or status in {"UNAUTHENTICATED", "PERMISSION_DENIED"} or "api key" in message.lower():
            return AppError(
                502,
                "GEMINI_AUTH_FAILED",
                "Gemini rejected the server's API key. Check GEMINI_API_KEY in backend/.env.",
            )
        if code == 404:
            return AppError(
                502,
                "GEMINI_MODEL_UNAVAILABLE",
                f"The Gemini model '{self._settings.gemini_model}' isn't available. Set GEMINI_MODEL in backend/.env.",
            )
        if 400 <= code < 500:
            detail = message.strip()[:200] or "invalid request"
            return AppError(502, "GEMINI_REQUEST_REJECTED", f"Gemini rejected the request: {detail}")
        return AppError(
            503,
            "GEMINI_UNAVAILABLE",
            "Gemini is temporarily unavailable. Try again in a minute.",
            retryable=True,
        )
