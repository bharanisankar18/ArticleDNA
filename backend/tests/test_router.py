import json

import httpx
from google.genai import errors as genai_errors

from conftest import FakeClient, article_request, gemini_payload, make_response
from config import Settings
from main import create_app
from services.ai_router import AIRouter
from services.gemini_service import GeminiService
from services.openai_compat import OpenAICompatProvider
from fastapi.testclient import TestClient

RATE_LIMIT = genai_errors.ClientError(429, {"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}})


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def compat(handler, name="groq", max_chars=100_000):
    return OpenAICompatProvider(
        name=name, label=name.title(), base_url="https://fake.test/v1", api_key="k", model=f"{name}-model",
        max_chars=max_chars, timeout_seconds=5, temperature=0.2, transport=httpx.MockTransport(handler),
    )


def chat_reply(content: str, status: int = 200, headers=None):
    return httpx.Response(status, json={"choices": [{"message": {"content": content}, "finish_reason": "stop"}]}, headers=headers)


def make(providers_after_gemini, gemini_outcomes, clock=None):
    settings = Settings(_env_file=None, gemini_api_key="test-key")
    async def no_sleep(_):
        return None
    gemini = GeminiService(settings, client=FakeClient(gemini_outcomes), sleep=no_sleep)
    router = AIRouter(settings, gemini, providers=[gemini, *providers_after_gemini], clock=clock or Clock())
    app = create_app(settings=settings)
    app.state.gemini = router
    return TestClient(app), router, gemini


def test_falls_back_when_gemini_is_rate_limited_and_then_skips_it():
    calls = []

    def handler(request: httpx.Request):
        calls.append(json.loads(request.content))
        return chat_reply("Here you go:\n```json\n" + json.dumps(gemini_payload()) + "\n```")

    client, router, gemini = make([compat(handler)], [RATE_LIMIT])
    res = client.post("/api/analyze", json=article_request())
    assert res.status_code == 200, res.text
    assert res.json()["meta"]["model"] == "groq-model via Groq"
    assert calls[0]["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in calls[0]["messages"][0]["content"]

    # Gemini is now cooling down: the next request goes straight to the fallback.
    client.post("/api/analyze", json=article_request())
    assert len(gemini._client.models.calls) == 1
    assert len(calls) == 2
    assert router.describe()[0]["status"] == "cooling_down"


def test_invalid_json_gets_one_corrective_retry():
    replies = iter([chat_reply('{"oops": true}'), chat_reply(json.dumps(gemini_payload()))])
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        return next(replies)

    client, _, _ = make([compat(handler)], [RATE_LIMIT])
    assert client.post("/api/analyze", json=article_request()).status_code == 200
    assert len(seen) == 2
    assert "did not match the schema" in seen[1]["messages"][-1]["content"]


def test_json_mode_rejection_retries_without_json_mode():
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        if "response_format" in body:
            return httpx.Response(400, json={"error": {"message": "Failed to validate JSON. Please adjust your prompt."}})
        return chat_reply("Sure.\n" + json.dumps(gemini_payload()))

    client, _, _ = make([compat(handler)], [RATE_LIMIT])
    assert client.post("/api/analyze", json=article_request()).status_code == 200
    assert "response_format" in seen[0] and "response_format" not in seen[1]


def test_every_provider_rate_limited():
    def handler(_):
        return chat_reply("", status=429, headers={"retry-after": "20"})

    client, _, _ = make([compat(handler)], [RATE_LIMIT])
    res = client.post("/api/analyze", json=article_request())
    assert res.status_code == 429
    body = res.json()["error"]
    assert body["code"] == "RATE_LIMITED"
    assert "Every AI provider" in body["message"]
    assert body["retry_after_seconds"] == 20


def test_non_rate_limit_failure_is_reported():
    def handler(_):
        return httpx.Response(401, json={"error": {"message": "bad key"}})

    client, _, _ = make([compat(handler)], [RATE_LIMIT])
    res = client.post("/api/analyze", json=article_request())
    assert res.json()["error"]["code"] == "GEMINI_AUTH_FAILED"
    assert "Groq" in res.json()["error"]["message"]


def test_long_articles_are_trimmed_for_small_providers():
    seen = []

    def handler(request):
        seen.append(json.loads(request.content))
        return chat_reply(json.dumps(gemini_payload()))

    client, _, _ = make([compat(handler, max_chars=1_000)], [RATE_LIMIT])
    long_text = ("A paragraph of article text that keeps going. " * 20 + "\n\n") * 6
    assert client.post("/api/analyze", json=article_request(content=long_text)).status_code == 200
    user_prompt = seen[0]["messages"][1]["content"]
    article_part = user_prompt.split("<article>")[1].split("</article>")[0]
    assert len(article_part) <= 1_100


def test_gemini_only_keeps_its_own_retries():
    settings = Settings(_env_file=None, gemini_api_key="k")
    gemini = GeminiService(settings, client=FakeClient([make_response("{}")]))
    AIRouter(settings, gemini)  # no fallback keys configured
    assert gemini.max_retries_override is None
