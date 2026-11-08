from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from google.genai import types

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import Settings  # noqa: E402
from main import create_app  # noqa: E402
from services.gemini_service import GeminiService  # noqa: E402

EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"

ARTICLE_TEXT = """\
Remote work has permanently changed how cities grow. In a survey of 2,400 employers conducted in \
March, 61 percent said they now allow employees to work from home at least three days a week.

The author argues that this shift will hollow out downtown business districts. "Office vacancy in \
the ten largest metros reached 19.6 percent this spring, the highest level ever recorded," the \
report notes. Smaller towns, meanwhile, are seeing an influx of residents who keep big-city jobs.

Critics say the trend is temporary and that companies will call workers back once leases are \
renegotiated. The author disagrees, pointing to the cost savings firms have already banked. Yet the \
article offers no data on how many firms have actually ended leases.

Future studies should track commuting patterns over a full decade to see whether the change lasts. \
Until then, city planners would be wise to treat downtown recovery as uncertain rather than assured.
"""


def gemini_payload(**overrides) -> dict:
    payload = {
        "content_assessment": {"content_type": "news_report", "is_analyzable": True, "note": ""},
        "central_topic": "Remote work and urban change",
        "research_summary": None,
        "article_summary": {
            "tldr": "Remote work is reshaping cities, and downtowns may not recover.",
            "core_concepts": [
                {"term": "Hybrid work", "explanation": "Splitting the week between home and office.",
                 "excerpt": "In a survey of 2,400 employers conducted in March"},
            ],
            "important_facts": [{"point": "Office vacancy hit a record.", "excerpt": ""}],
            "statistics": [
                {"figure": "19.6 percent", "context": "Office vacancy in the largest metros.", "excerpt": ""},
                {"figure": "73 percent", "context": "Invented number, must be dropped.", "excerpt": ""},
            ],
            "key_quotes": [
                {"quote": "Office vacancy in the ten largest metros reached 19.6 percent this spring", "speaker": "The report"},
                {"quote": "Cities are dying and nobody cares.", "speaker": "Invented"},
            ],
            "references": [
                {"source": "the report", "cited_for": "Vacancy figures.", "excerpt": ""},
                {"source": "Harvard Business Review", "cited_for": "Not in the article, must be dropped.", "excerpt": ""},
            ],
            "further_reading": [{"topic": "Urban economics", "reason": "Context for downtown decline."}],
        },
        "main_argument": {
            "thesis": "Remote work will permanently weaken downtown business districts.",
            "author_intent": "Readers should treat downtown recovery as uncertain.",
            "contrast_with_other_views": "Critics think the shift is temporary; the author does not.",
            # Same words, different quotes and spacing: must still verify.
            "supporting_excerpt": "Remote work has   permanently changed how cities grow.",
        },
        "evidence": [
            {
                "claim": "Most employers now allow hybrid work.",
                "excerpt": "61 percent said they now allow employees to work from home at least three days a week",
                "evidence_type": "empirical",
                "explanation": "A survey figure supports the claim.",
                "strength": "moderate",
            },
            {
                "claim": "Office vacancy is at a record high.",
                "excerpt": "“Office vacancy in the ten largest metros reached 19.6 percent this spring”",
                "evidence_type": "empirical",
                "explanation": "A cited statistic.",
                "strength": "strong",
            },
            {
                "claim": "Firms are abandoning offices.",
                # Fabricated: not in the article.
                "excerpt": "Thousands of firms have already terminated their office leases.",
                "evidence_type": "unsupported",
                "explanation": "No data is given.",
                "strength": "weak",
            },
        ],
        "assumptions": [
            {
                "assumption": "Cost savings will outweigh the benefits of offices.",
                "basis": "inferred",
                "explanation": "The argument depends on firms prioritising savings.",
                "excerpt": "",
            }
        ],
        "limitations": [
            {
                "limitation": "No lease data.",
                "category": "missing_evidence",
                "explanation": "The article admits it has no data on ended leases.",
                "excerpt": "Yet the article offers no data on how many firms have actually ended leases.",
            }
        ],
        "future_directions": [
            {
                "direction": "Compare small-town tax revenue before and after.",
                "source": "ai_suggested",
                "rationale": "The influx of residents could be measured.",
                "excerpt": "",
            },
            {
                "direction": "Track commuting patterns over a decade.",
                "source": "author",
                "rationale": "The author proposes it directly.",
                "excerpt": "Future studies should track commuting patterns over a full decade ... whether the change lasts.",
            },
        ],
        "key_takeaways": ["One.", "Two.", "Three.", "Four.", "Five.", "Six (should be dropped)."],
        "missing_information": ["Survey methodology", "  "],
    }
    payload.update(overrides)
    return payload


def make_response(text: str | None, finish: str = "STOP", block_reason: str | None = None):
    return SimpleNamespace(
        text=text,
        candidates=[SimpleNamespace(finish_reason=getattr(types.FinishReason, finish))],
        prompt_feedback=SimpleNamespace(block_reason=block_reason) if block_reason else None,
    )


class FakeModels:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls: list[dict] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.outcomes.pop(0) if len(self.outcomes) > 1 else self.outcomes[0]
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


class FakeClient:
    def __init__(self, outcomes):
        self.models = FakeModels(outcomes)
        self.aio = SimpleNamespace(models=self.models)


@pytest.fixture
def settings() -> Settings:
    return Settings(_env_file=None, gemini_api_key="test-key", gemini_max_retries=2, min_content_words=50)


@pytest.fixture
def make_client(settings):
    """Build a TestClient whose Gemini calls return the given outcomes in order."""

    def _make(outcomes, configured: bool = True):
        fake = FakeClient(outcomes)
        sleeps: list[float] = []

        async def no_sleep(seconds):
            sleeps.append(seconds)

        service = GeminiService(settings, client=fake if configured else None, sleep=no_sleep)
        if not configured:
            service._client = None
        app = create_app(settings=settings, gemini=service)
        client = TestClient(app)
        client.fake = fake
        client.sleeps = sleeps
        return client

    return _make


@pytest.fixture
def ok_response():
    return make_response(json.dumps(gemini_payload()))


def article_request(**overrides) -> dict:
    body = {
        "title": "How remote work is reshaping cities",
        "url": "https://example.com/remote-work",
        "content": ARTICLE_TEXT,
        "author": "Jane Doe",
        "published_date": "2026-03-04",
        "site_name": "Example News",
    }
    body.update(overrides)
    return body
