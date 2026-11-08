"""Any OpenAI-compatible chat API (Groq, OpenRouter, Ollama, ...) as an analysis provider.

These APIs don't all support strict schema-constrained output, so the JSON Schema goes into the
system prompt, JSON mode is requested, and the reply is validated with Pydantic like Gemini's.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import ssl
from functools import lru_cache
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from services.errors import AppError

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("articledna.openai_compat")
SHORT_WAIT_SECONDS = 10
_FENCE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


@lru_cache(maxsize=1)
def _tls_context() -> ssl.SSLContext | bool:
    """Verify HTTPS against the operating system's certificate store.

    Python's bundled certificates miss roots that Windows trusts (for example those added by
    antivirus or company networks that inspect HTTPS), which makes every call fail with
    CERTIFICATE_VERIFY_FAILED. Verification stays on; only the trust store changes.
    """
    try:
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:  # pragma: no cover - truststore is in requirements.txt
        return True


def _extract_json(text: str) -> str:
    text = _FENCE.sub("", text.strip())
    start, end = text.find("{"), text.rfind("}")
    return text[start : end + 1] if start >= 0 and end > start else text


class OpenAICompatProvider:
    def __init__(
        self,
        *,
        name: str,
        label: str,
        base_url: str,
        api_key: str,
        model: str,
        max_chars: int,
        timeout_seconds: float,
        temperature: float,
        extra_headers: dict[str, str] | None = None,
        extra_body: dict | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.name = name
        self.label = label
        self.model = model
        self.max_chars = max_chars
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._headers = {"Content-Type": "application/json", **(extra_headers or {})}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"
        self._timeout = timeout_seconds
        self._temperature = temperature
        self._transport = transport
        self._json_mode = True
        self._extra_body = extra_body or {}

    @property
    def model_label(self) -> str:
        return f"{self.model} via {self.label}"

    async def generate(self, system_instruction: str, prompt: str, schema: type[T]) -> T:
        system = (
            f"{system_instruction}\n\nRespond with one JSON object only, no prose, matching this JSON "
            f"Schema exactly (use null where the schema allows it):\n"
            f"{json.dumps(schema.model_json_schema(), separators=(',', ':'))}"
        )
        messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        last_error: AppError | None = None
        for attempt in range(2):  # one retry with the validation error fed back
            try:
                text, finish = await self._call(messages, json_mode=self._json_mode)
            except AppError as error:
                if error.code != "JSON_MODE_REJECTED":
                    raise
                # The provider's strict JSON check refused the answer. Ask again without it and
                # validate the JSON here instead (as for every provider).
                self._json_mode = False
                text, finish = await self._call(messages, json_mode=False)
            try:
                return schema.model_validate_json(_extract_json(text))
            except ValidationError as error:
                logger.warning("provider output failed validation", extra={"provider": self.name, "errors": error.error_count()})
                if finish == "length":
                    last_error = AppError(502, "AI_RESPONSE_INCOMPLETE", f"{self.label}'s answer was cut off.", retryable=True)
                    break
                last_error = AppError(502, "AI_RESPONSE_INVALID", f"{self.label} returned an analysis in an unexpected format.", retryable=True)
                if attempt == 0:
                    messages = messages + [
                        {"role": "assistant", "content": text[:4000]},
                        {"role": "user", "content": "That JSON did not match the schema. "
                         f"Problems: {str(error)[:800]}. Reply again with corrected JSON only."},
                    ]
        assert last_error is not None
        raise last_error

    async def _call(self, messages: list[dict], json_mode: bool = True, _retry: bool = True) -> tuple[str, str | None]:
        body: dict = {"model": self.model, "messages": messages, "temperature": self._temperature, **self._extra_body}
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        try:
            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport, verify=_tls_context()) as client:
                response = await client.post(self._url, headers=self._headers, json=body)
        except httpx.TimeoutException:
            raise AppError(504, "GEMINI_TIMEOUT", f"{self.label} took too long to respond.", retryable=True) from None
        except httpx.TransportError:
            raise AppError(503, "GEMINI_UNREACHABLE", f"The server couldn't reach {self.label}.", retryable=True) from None

        if response.status_code == 429 and _retry:
            error = self._map_error(response)
            # Per-minute token limits (Groq's free tier) often clear within seconds: wait once.
            if error.retry_after_seconds is not None and error.retry_after_seconds <= SHORT_WAIT_SECONDS:
                await asyncio.sleep(error.retry_after_seconds + 0.5)
                return await self._call(messages, json_mode=json_mode, _retry=False)
            raise error
        if response.status_code >= 400:
            raise self._map_error(response)
        try:
            data = response.json()
            choice = data["choices"][0]
            return choice["message"]["content"] or "", choice.get("finish_reason")
        except (ValueError, KeyError, IndexError, TypeError):
            raise AppError(502, "AI_RESPONSE_INVALID", f"{self.label} sent a response that couldn't be read.", retryable=True) from None

    def _map_error(self, response: httpx.Response) -> AppError:
        status = response.status_code
        try:
            detail = str(response.json().get("error", {}).get("message", ""))[:200]
        except (ValueError, AttributeError):
            detail = response.text[:200]
        if status == 429:
            retry = response.headers.get("retry-after")
            seconds = math.ceil(float(retry)) if retry and re.fullmatch(r"[\d.]+", retry) else None
            return AppError(429, "RATE_LIMITED", f"{self.label}'s rate limit was reached.", retryable=True, retry_after_seconds=seconds)
        if status in (401, 403):
            return AppError(502, "GEMINI_AUTH_FAILED", f"{self.label} rejected the API key. Check it in backend/.env.")
        if status == 404:
            return AppError(502, "GEMINI_MODEL_UNAVAILABLE", f"{self.label} doesn't offer the model '{self.model}'. Change it in backend/.env.")
        if status == 400 and ("validate json" in detail.lower() or "json_validate" in detail.lower() or "response_format" in detail.lower()):
            return AppError(502, "JSON_MODE_REJECTED", f"{self.label} rejected JSON mode.", retryable=True)
        if status == 413 or "context" in detail.lower() or "too large" in detail.lower():
            return AppError(413, "CONTENT_TOO_LONG", f"The article is too long for {self.label}'s current limits.", retryable=True)
        if 400 <= status < 500:
            return AppError(502, "GEMINI_REQUEST_REJECTED", f"{self.label} rejected the request: {detail or status}")
        return AppError(503, "GEMINI_UNAVAILABLE", f"{self.label} is temporarily unavailable.", retryable=True)
