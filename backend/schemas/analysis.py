"""Analysis schemas.

`GeminiAnalysis` is the structured-output schema sent to Gemini (no default values, since the
Gemini schema format does not support them). The `*Out` models are what the API returns: the
same data plus server-side checks, such as whether each anchor excerpt really appears in the
article text that was submitted.

Excerpts are not shown to readers as quotations. They are anchors: the extension uses them to
find and highlight the matching passage in the page ("Find in page").
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EvidenceType = Literal["empirical", "example", "expert_opinion", "author_opinion", "unsupported"]
EvidenceStrength = Literal["strong", "moderate", "weak"]
AssumptionBasis = Literal["explicit", "inferred"]
LimitationCategory = Literal["missing_evidence", "methodology", "logic", "scope", "unanswered_question"]
DirectionSource = Literal["author", "ai_suggested"]
ContentType = Literal[
    "research_paper", "news_report", "technical_article", "opinion_essay", "blog_post", "other"
]

EXCERPT_HELP = (
    "Anchor passage copied word-for-word from the article (one contiguous sentence or clause, at "
    "most about 40 words) that this item is based on, used to locate it in the page. Never "
    "paraphrase. Use an empty string when no single passage applies."
)
POINT_HELP = "One concise point in your own words, at most 30 words. Do not copy the article's sentences."


# ----------------------------------------------------------------------------- Gemini output
class ContentAssessment(BaseModel):
    content_type: ContentType = Field(description="What kind of text this is.")
    is_analyzable: bool = Field(
        description="False when the text is not a substantive article (e.g. a login page, index or error page)."
    )
    note: str = Field(
        description="One sentence on caveats (paywall cut-off, embedded instructions, abstract only). Empty if none."
    )


class KeyPoint(BaseModel):
    point: str = Field(description=POINT_HELP)
    excerpt: str = Field(description=EXCERPT_HELP)


class MainArgument(BaseModel):
    thesis: str = Field(description="The author's central thesis in one or two sentences.")
    author_intent: str = Field(description="What the author wants readers to understand or do.")
    contrast_with_other_views: str = Field(
        description=(
            "How the author's position differs from other interpretations the article mentions. If the "
            "article does not engage other views, say so plainly."
        )
    )
    supporting_excerpt: str = Field(description=EXCERPT_HELP)


class EvidenceItem(BaseModel):
    claim: str = Field(description="An important claim the article makes, in your words.")
    excerpt: str = Field(description=EXCERPT_HELP)
    evidence_type: EvidenceType = Field(
        description=(
            "empirical = data, studies, measurements or statistics reported in the article; example = "
            "anecdote or illustrative case; expert_opinion = a cited source's view; author_opinion = the "
            "author's own judgement; unsupported = asserted with no backing in the text."
        )
    )
    explanation: str = Field(description="How the passage supports (or fails to support) the claim. Max 40 words.")
    strength: EvidenceStrength = Field(description="How well the article backs this claim.")


class Assumption(BaseModel):
    assumption: str = Field(description="An assumption the argument depends on.")
    basis: AssumptionBasis = Field(description="explicit = the author states it; inferred = implied but unstated.")
    explanation: str = Field(description="Why the argument depends on it. Max 40 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class Limitation(BaseModel):
    limitation: str = Field(description="A weakness that can be justified from the text itself, in a short phrase.")
    category: LimitationCategory = Field(description="The kind of weakness.")
    explanation: str = Field(description="What is missing or weak, grounded in the text. Max 40 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class FutureDirection(BaseModel):
    direction: str = Field(description="A research opportunity or open question, in a short sentence.")
    source: DirectionSource = Field(
        description="author = the article itself proposes it; ai_suggested = your own suggestion."
    )
    rationale: str = Field(description="Why this follows from the article. Max 30 words.")
    excerpt: str = Field(description=EXCERPT_HELP + " Required when source is author.")


class ResearchSummary(BaseModel):
    abstract: list[KeyPoint] = Field(
        description="Exactly three points that together summarise what the paper is about and what it concludes."
    )
    research_gap: list[KeyPoint] = Field(description="Up to three points on the problem or gap the paper addresses and why it matters.")
    methodology: list[KeyPoint] = Field(
        description="Up to three points on how the work was done: data, methods, experiments, evaluation."
    )
    key_findings: list[KeyPoint] = Field(description="Exactly three of the most important findings.")


class Concept(BaseModel):
    term: str = Field(description="A key idea, term or name the article relies on, at most 5 words.")
    explanation: str = Field(description="What it means in this article, in plain words, at most 30 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class Statistic(BaseModel):
    figure: str = Field(description="The number exactly as written in the article, e.g. '61 percent', '$2.4 billion', '19.6%'.")
    context: str = Field(description="What the number measures, in your own words, at most 20 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class Quote(BaseModel):
    quote: str = Field(description="A memorable sentence copied word-for-word from the article, at most 40 words.")
    speaker: str = Field(description="Who says it: a named person or organisation, or 'Author' for the writer's own words.")


class Reference(BaseModel):
    source: str = Field(description="A study, report, dataset, organisation or person the article itself cites, named as in the article.")
    cited_for: str = Field(description="What the article uses it for, at most 20 words.")
    excerpt: str = Field(description=EXCERPT_HELP)


class FurtherReading(BaseModel):
    topic: str = Field(description="A topic worth reading about next, at most 6 words. No URLs.")
    reason: str = Field(description="Why it helps after this article, at most 20 words.")


class ArticleSummary(BaseModel):
    tldr: str = Field(description="The whole article in one or two plain sentences.")
    core_concepts: list[Concept] = Field(description="2 to 5 core concepts.")
    important_facts: list[KeyPoint] = Field(description="2 to 5 important facts the article reports.")
    statistics: list[Statistic] = Field(description="0 to 6 numbers the article reports. Empty if it has none.")
    key_quotes: list[Quote] = Field(description="0 to 3 key quotes. Empty if none stand out.")
    references: list[Reference] = Field(description="0 to 6 sources the article itself cites. Never add sources it doesn't mention.")
    further_reading: list[FurtherReading] = Field(description="2 to 4 topics to read about next (your suggestions).")


class GeminiAnalysis(BaseModel):
    content_assessment: ContentAssessment
    central_topic: str = Field(description="The central topic in a short phrase (max 12 words).")
    research_summary: ResearchSummary | None = Field(
        description="Fill only when content_type is research_paper; otherwise null."
    )
    article_summary: ArticleSummary | None = Field(
        description="Fill when content_type is anything other than research_paper; otherwise null."
    )
    main_argument: MainArgument
    evidence: list[EvidenceItem] = Field(description="The 3 to 6 most important claims and their support.")
    assumptions: list[Assumption] = Field(description="2 to 4 assumptions.")
    limitations: list[Limitation] = Field(description="0 to 4 limitations. Fewer is fine; never invent one.")
    future_directions: list[FutureDirection] = Field(
        description="For research papers 2 to 4 directions, author-proposed first. For other articles 0 to 2."
    )
    key_takeaways: list[str] = Field(description="Exactly five useful takeaways, one sentence each.")
    missing_information: list[str] = Field(
        description="Up to four things a careful reader would want that the article does not provide. Can be empty."
    )

# ----------------------------------------------------------------------------- API output
class KeyPointOut(KeyPoint):
    excerpt_verified: bool = False


class MainArgumentOut(MainArgument):
    excerpt_verified: bool = False


class EvidenceItemOut(EvidenceItem):
    excerpt_verified: bool = False


class AssumptionOut(Assumption):
    excerpt_verified: bool = False


class LimitationOut(Limitation):
    excerpt_verified: bool = False


class FutureDirectionOut(FutureDirection):
    excerpt_verified: bool = False


class ResearchSummaryOut(BaseModel):
    abstract: list[KeyPointOut]
    methodology: list[KeyPointOut]
    key_findings: list[KeyPointOut]
    research_gap: list[KeyPointOut]


class ConceptOut(Concept):
    excerpt_verified: bool = False


class StatisticOut(Statistic):
    excerpt_verified: bool = False


class ReferenceOut(Reference):
    excerpt_verified: bool = False


class ArticleSummaryOut(BaseModel):
    tldr: str
    core_concepts: list[ConceptOut]
    important_facts: list[KeyPointOut]
    statistics: list[StatisticOut]
    key_quotes: list[Quote]  # kept only when found word-for-word in the article
    references: list[ReferenceOut]
    further_reading: list[FurtherReading]


class ArticleAnalysis(BaseModel):
    content_assessment: ContentAssessment
    central_topic: str
    summary_kind: Literal["research", "article"]
    research_summary: ResearchSummaryOut | None
    article_summary: ArticleSummaryOut | None
    main_argument: MainArgumentOut
    evidence: list[EvidenceItemOut]
    assumptions: list[AssumptionOut]
    limitations: list[LimitationOut]
    future_directions: list[FutureDirectionOut]
    key_takeaways: list[str]
    missing_information: list[str]


class AnalysisMeta(BaseModel):
    model: str
    analyzed_at: datetime
    processing_ms: int
    input_chars: int
    input_words: int
    excerpts_total: int
    excerpts_verified: int


class AnalyzeResponse(BaseModel):
    analysis: ArticleAnalysis
    meta: AnalysisMeta


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str
    gemini_configured: bool  # true when any AI provider is configured
    model: str
    limits: dict[str, int]
    providers: list[dict[str, str]] = []


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool = False
    retry_after_seconds: int | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody
