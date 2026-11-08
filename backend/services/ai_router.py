"""Route each analysis to the first available AI provider.

Providers are tried in the order set by AI_PROVIDERS. When one is rate limited, down, misconfigured
or returns unusable output, the next one is tried. A rate-limited provider is skipped until its
limit should have reset, so later requests don't wait on it.
"""
from __future__ import annotations

import logging
import math
import time
from typing import Protocol, TypeVar

from pydantic import BaseModel

from config import Settings
from prompts.analysis_prompt import SYSTEM_INSTRUCTION, VISUAL_SYSTEM_INSTRUCTION, build_user_prompt
from schemas.analysis import GeminiAnalysis
from schemas.article import AnalyzeRequest
from schemas.visual import GeminiVisual
from services.errors import AppError
from services.gemini_service import GeminiService
from services.openai_compat import OpenAICompatProvider

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("articledna.router")

# Errors after which another provider may well succeed.
FALLBACK_CODES = {
    "RATE_LIMITED",
    "GEMINI_UNAVAILABLE",
    "GEMINI_UNREACHABLE",
    "GEMINI_TIMEOUT",
    "GEMINI_AUTH_FAILED",
    "GEMINI_MODEL_UNAVAILABLE",
    "GEMINI_REQUEST_REJECTED",
    "GEMINI_NOT_CONFIGURED",
    "AI_RESPONSE_INVALID",
    "AI_RESPONSE_INCOMPLETE",
    "AI_RESPONSE_EMPTY",
    "CONTENT_TOO_LONG",
}
DEFAULT_RATE_LIMIT_COOLDOWN = 120.0
OUTAGE_COOLDOWN = 30.0


class Provider(Protocol):
    name: str
    label: str

    @property
    def model_label(self) -> str: ...

    @property
    def max_chars(self) -> int: ...

    async def generate(self, system_instruction: str, prompt: str, schema: type[T]) -> T: ...


def _trim(text: str, max_chars: int) -> str:
    """Cut at a paragraph boundary so a provider with a smaller limit still gets whole paragraphs."""
    if len(text) <= max_chars:
        return text
    cut = text.rfind("\n\n", 0, max_chars)
    return text[: cut if cut > max_chars * 0.7 else max_chars]


def build_providers(settings: Settings, gemini: GeminiService) -> list[Provider]:
    available: dict[str, Provider] = {}
    if gemini.configured:
        available["gemini"] = gemini
    timeout = settings.fallback_timeout_seconds
    if settings.groq_api_key.strip():
        available["groq"] = OpenAICompatProvider(
            name="groq", label="Groq", base_url="https://api.groq.com/openai/v1", api_key=settings.groq_api_key.strip(),
            model=settings.groq_model, max_chars=settings.groq_max_chars, timeout_seconds=timeout,
            temperature=settings.gemini_temperature,
            # Reasoning models (gpt-oss) otherwise spend the output budget thinking; keep the whole
            # request inside the free tier's tokens-per-minute limit.
            extra_body={"max_completion_tokens": settings.groq_max_output_tokens,
                        **({"reasoning_effort": "low"} if "gpt-oss" in settings.groq_model else {})},
        )
    if settings.openrouter_api_key.strip():
        available["openrouter"] = OpenAICompatProvider(
            name="openrouter", label="OpenRouter", base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key.strip(), model=settings.openrouter_model,
            max_chars=settings.openrouter_max_chars, timeout_seconds=timeout, temperature=settings.gemini_temperature,
            extra_headers={"X-Title": "ArticleDNA"},
        )
    if settings.ollama_base_url.strip():
        available["ollama"] = OpenAICompatProvider(
            name="ollama", label="Ollama", base_url=settings.ollama_base_url.strip().rstrip("/") + "/v1", api_key="",
            model=settings.ollama_model, max_chars=settings.ollama_max_chars, timeout_seconds=max(timeout, 300),
            temperature=settings.gemini_temperature,
        )
    order = [name.strip().lower() for name in settings.ai_providers.split(",") if name.strip()]
    return [available[name] for name in order if name in available]


class AIRouter:
    def __init__(self, settings: Settings, gemini: GeminiService, providers: list[Provider] | None = None, clock=time.monotonic):
        self._settings = settings
        self.providers: list[Provider] = providers if providers is not None else build_providers(settings, gemini)
        if len(self.providers) > 1:
            gemini.max_retries_override = 0  # another provider is ready; don't make the reader wait on retries
        self._cooldown: dict[str, float] = {}
        self._clock = clock

    @property
    def configured(self) -> bool:
        return bool(self.providers)

    @property
    def model(self) -> str:
        return self.providers[0].model_label if self.providers else self._settings.gemini_model

    def describe(self) -> list[dict[str, str]]:
        now = self._clock()
        return [
            {
                "name": p.name,
                "label": p.label,
                "model": p.model_label,
                "status": "cooling_down" if self._cooldown.get(p.name, 0) > now else "ready",
            }
            for p in self.providers
        ]

    async def analyze(self, request: AnalyzeRequest) -> tuple[GeminiAnalysis, str]:
        return await self._run(request, "Analyze the article below.", SYSTEM_INSTRUCTION, GeminiAnalysis)

    async def visualize(self, request: AnalyzeRequest) -> tuple[GeminiVisual, str]:
        return await self._run(
            request, "Build the workflow and knowledge graph for the article below.", VISUAL_SYSTEM_INSTRUCTION, GeminiVisual
        )

    async def _run(self, request: AnalyzeRequest, task: str, system: str, schema: type[T]) -> tuple[T, str]:
        if not self.providers:
            raise AppError(
                503,
                "GEMINI_NOT_CONFIGURED",
                "The ArticleDNA server has no AI provider key. Add GEMINI_API_KEY (or a fallback such as GROQ_API_KEY) to backend/.env and restart it.",
            )
        errors: list[AppError] = []
        waits: list[float] = []
        now = self._clock()
        for provider in self.providers:
            until = self._cooldown.get(provider.name, 0.0)
            if until > now:
                waits.append(until - now)
                continue
            prompt = build_user_prompt(
                title=request.title,
                url=request.url,
                content=_trim(request.content, provider.max_chars),
                author=request.author,
                published_date=request.published_date,
                site_name=request.site_name,
                task=task,
            )
            try:
                result = await provider.generate(system, prompt, schema)
                if errors:
                    logger.info("served by fallback provider", extra={"provider": provider.name, "skipped": len(errors)})
                return result, provider.model_label
            except AppError as error:
                if error.code not in FALLBACK_CODES:
                    raise
                if error.code == "RATE_LIMITED":
                    seconds = float(error.retry_after_seconds or DEFAULT_RATE_LIMIT_COOLDOWN)
                    self._cooldown[provider.name] = self._clock() + seconds
                    waits.append(seconds)
                elif error.code in {"GEMINI_UNAVAILABLE", "GEMINI_UNREACHABLE"}:
                    self._cooldown[provider.name] = self._clock() + OUTAGE_COOLDOWN
                logger.warning("provider failed, trying the next", extra={"provider": provider.name, "code": error.code})
                errors.append(error)

        if all(e.code == "RATE_LIMITED" for e in errors):
            names = ", ".join(p.label for p in self.providers)
            wait = math.ceil(min(waits)) if waits else None
            raise AppError(
                429,
                "RATE_LIMITED",
                f"Every AI provider is at its limit right now ({names}). Add another provider key in backend/.env, or wait.",
                retryable=True,
                retry_after_seconds=wait,
            )
        # Report the most informative failure: anything other than a rate limit.
        raise next(e for e in errors if e.code != "RATE_LIMITED")
