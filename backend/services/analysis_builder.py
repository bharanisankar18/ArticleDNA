"""Turn Gemini's raw output into API responses: tidy it and verify every anchor excerpt."""
from __future__ import annotations

import re

from schemas.analysis import (
    ArticleAnalysis,
    ArticleSummary,
    ArticleSummaryOut,
    AssumptionOut,
    ConceptOut,
    EvidenceItemOut,
    FurtherReading,
    FutureDirectionOut,
    GeminiAnalysis,
    KeyPoint,
    KeyPointOut,
    LimitationOut,
    MainArgumentOut,
    Quote,
    ReferenceOut,
    ResearchSummary,
    ResearchSummaryOut,
    StatisticOut,
)
from schemas.visual import GeminiVisual, GraphEdge, GraphNodeOut, Visualization, WorkflowStepOut
from services.text_tools import ExcerptVerifier, normalize_for_match

MAX_POINTS = 3
MAX_ITEMS = {"evidence": 8, "assumptions": 6, "limitations": 6, "future_directions": 6}
MAX_TAKEAWAYS = 5
MAX_MISSING = 6
MAX_STEPS = 8
MAX_NODES = 16
MAX_EDGES = 26


def _clean(text: str) -> str:
    return " ".join(text.split())


class _Checker:
    def __init__(self, article_text: str) -> None:
        self._verifier = ExcerptVerifier(article_text)
        self._normalized = normalize_for_match(article_text)

    def mentions(self, text: str) -> bool:
        """True when the article contains this text (ignoring case, spacing and punctuation)."""
        needle = normalize_for_match(text)
        return bool(needle) and needle in self._normalized

    def __call__(self, excerpt: str) -> tuple[str, bool]:
        excerpt = excerpt.strip()
        if not excerpt:
            return "", False
        return excerpt, self._verifier.is_verbatim(excerpt)


def _points(raw: list[KeyPoint], check: _Checker) -> list[KeyPointOut]:
    out = []
    for item in raw:
        if not item.point.strip():
            continue
        excerpt, ok = check(item.excerpt)
        out.append(KeyPointOut(point=_clean(item.point), excerpt=excerpt, excerpt_verified=ok))
    return out[:MAX_POINTS]


def _research(raw: ResearchSummary, check: _Checker) -> ResearchSummaryOut:
    return ResearchSummaryOut(
        abstract=_points(raw.abstract, check),
        methodology=_points(raw.methodology, check),
        key_findings=_points(raw.key_findings, check),
        research_gap=_points(raw.research_gap, check),
    )


def _article(raw: ArticleSummary, check: _Checker) -> ArticleSummaryOut:
    concepts = []
    for c in raw.core_concepts:
        if c.term.strip():
            excerpt, ok = check(c.excerpt)
            concepts.append(ConceptOut(term=_clean(c.term), explanation=_clean(c.explanation), excerpt=excerpt, excerpt_verified=ok))
    stats = []
    for s in raw.statistics:
        # A number the article doesn't contain would be invented: drop it.
        if s.figure.strip() and check.mentions(s.figure):
            excerpt, ok = check(s.excerpt)
            stats.append(StatisticOut(figure=_clean(s.figure), context=_clean(s.context), excerpt=excerpt, excerpt_verified=ok))
    quotes = [
        Quote(quote=_clean(q.quote).strip('"\u201c\u201d '), speaker=_clean(q.speaker) or "Author")
        for q in raw.key_quotes
        if q.quote.strip() and check(q.quote)[1]  # quotes must be word-for-word
    ]
    refs = []
    for r in raw.references:
        excerpt, ok = check(r.excerpt)
        # Only sources the article actually names.
        if r.source.strip() and (check.mentions(r.source) or ok):
            refs.append(ReferenceOut(source=_clean(r.source), cited_for=_clean(r.cited_for), excerpt=excerpt, excerpt_verified=ok))
    reading = [FurtherReading(topic=_clean(f.topic), reason=_clean(f.reason)) for f in raw.further_reading if f.topic.strip()]
    facts = []
    for item in raw.important_facts:
        if item.point.strip():
            excerpt, ok = check(item.excerpt)
            facts.append(KeyPointOut(point=_clean(item.point), excerpt=excerpt, excerpt_verified=ok))
    return ArticleSummaryOut(
        tldr=_clean(raw.tldr),
        core_concepts=concepts[:5],
        important_facts=facts[:5],
        statistics=stats[:6],
        key_quotes=quotes[:3],
        references=refs[:6],
        further_reading=reading[:4],
    )


def build_analysis(raw: GeminiAnalysis, article_text: str) -> tuple[ArticleAnalysis, int, int]:
    """Return (analysis, excerpts_total, excerpts_verified)."""
    check = _Checker(article_text)

    main_excerpt, main_ok = check(raw.main_argument.supporting_excerpt)
    main_argument = MainArgumentOut(
        thesis=_clean(raw.main_argument.thesis),
        author_intent=_clean(raw.main_argument.author_intent),
        contrast_with_other_views=_clean(raw.main_argument.contrast_with_other_views),
        supporting_excerpt=main_excerpt,
        excerpt_verified=main_ok,
    )

    evidence = []
    for item in raw.evidence:
        if item.claim.strip():
            excerpt, ok = check(item.excerpt)
            evidence.append(
                EvidenceItemOut(
                    claim=_clean(item.claim),
                    excerpt=excerpt,
                    evidence_type=item.evidence_type,
                    explanation=_clean(item.explanation),
                    strength=item.strength,
                    excerpt_verified=ok,
                )
            )

    assumptions = []
    for item in raw.assumptions:
        if item.assumption.strip():
            excerpt, ok = check(item.excerpt)
            assumptions.append(
                AssumptionOut(
                    assumption=_clean(item.assumption),
                    basis=item.basis,
                    explanation=_clean(item.explanation),
                    excerpt=excerpt,
                    excerpt_verified=ok,
                )
            )

    limitations = []
    for item in raw.limitations:
        if item.limitation.strip():
            excerpt, ok = check(item.excerpt)
            limitations.append(
                LimitationOut(
                    limitation=_clean(item.limitation),
                    category=item.category,
                    explanation=_clean(item.explanation),
                    excerpt=excerpt,
                    excerpt_verified=ok,
                )
            )

    directions = []
    for item in raw.future_directions:
        if item.direction.strip():
            excerpt, ok = check(item.excerpt)
            directions.append(
                FutureDirectionOut(
                    direction=_clean(item.direction),
                    source=item.source,
                    rationale=_clean(item.rationale),
                    excerpt=excerpt,
                    excerpt_verified=ok,
                )
            )
    # Author-proposed work first, then ArticleDNA's suggestions (stable within each group).
    directions.sort(key=lambda d: d.source != "author")

    # Research papers get the research summary; everything else the article summary. If Gemini
    # filled the wrong one (or neither), fall back to whatever it did provide.
    wants_research = raw.content_assessment.content_type == "research_paper"
    kind = "research" if (raw.research_summary and (wants_research or not raw.article_summary)) else "article"
    article = None
    if kind == "article":
        article = (
            _article(raw.article_summary, check)
            if raw.article_summary
            else ArticleSummaryOut(tldr=_clean(raw.central_topic), core_concepts=[], important_facts=[], statistics=[],
                                   key_quotes=[], references=[], further_reading=[])
        )

    analysis = ArticleAnalysis(
        content_assessment=raw.content_assessment,
        central_topic=_clean(raw.central_topic),
        summary_kind=kind,
        research_summary=_research(raw.research_summary, check) if kind == "research" and raw.research_summary else None,
        article_summary=article,
        main_argument=main_argument,
        evidence=evidence[: MAX_ITEMS["evidence"]],
        assumptions=assumptions[: MAX_ITEMS["assumptions"]],
        limitations=limitations[: MAX_ITEMS["limitations"]],
        future_directions=directions[: MAX_ITEMS["future_directions"]],
        key_takeaways=[_clean(t) for t in raw.key_takeaways if t.strip()][:MAX_TAKEAWAYS],
        missing_information=[_clean(m) for m in raw.missing_information if m.strip()][:MAX_MISSING],
    )

    summary_items: list = []
    if analysis.research_summary:
        r = analysis.research_summary
        summary_items = [*r.abstract, *r.methodology, *r.key_findings, *r.research_gap]
    elif analysis.article_summary:
        s = analysis.article_summary
        summary_items = [*s.core_concepts, *s.important_facts, *s.statistics, *s.references]
    anchored = [
        *summary_items,
        *analysis.evidence,
        *analysis.assumptions,
        *analysis.limitations,
        *analysis.future_directions,
    ]
    pairs = [(item.excerpt, item.excerpt_verified) for item in anchored]
    pairs.append((analysis.main_argument.supporting_excerpt, analysis.main_argument.excerpt_verified))
    total = sum(1 for text, _ in pairs if text)
    verified = sum(1 for text, ok in pairs if text and ok)
    return analysis, total, verified


_ID_CHARS = re.compile(r"[^a-z0-9-]+")


def _node_id(raw: str) -> str:
    return _ID_CHARS.sub("-", raw.strip().lower()).strip("-")[:40]


def build_visual(raw: GeminiVisual, article_text: str) -> Visualization:
    """Tidy the diagrams and keep the graph consistent: unique ids, no dangling or duplicate edges."""
    check = _Checker(article_text)

    steps = []
    for step in raw.workflow:
        if step.title.strip():
            excerpt, ok = check(step.excerpt)
            steps.append(
                WorkflowStepOut(
                    title=_clean(step.title),
                    detail=_clean(step.detail),
                    kind=step.kind,
                    excerpt=excerpt,
                    excerpt_verified=ok,
                )
            )

    nodes: list[GraphNodeOut] = []
    id_map: dict[str, str] = {}
    seen_labels: set[str] = set()
    for node in raw.nodes:
        node_id = _node_id(node.id) or _node_id(node.label)
        label = _clean(node.label)
        if not node_id or not label or node_id in id_map.values() or label.lower() in seen_labels:
            # Map a duplicate's id onto the node already kept, so its edges still resolve.
            if node.id not in id_map and node_id in id_map.values():
                id_map[node.id] = node_id
            continue
        excerpt, ok = check(node.excerpt)
        id_map[node.id] = node_id
        seen_labels.add(label.lower())
        nodes.append(
            GraphNodeOut(
                id=node_id,
                label=label,
                group=node.group,
                description=_clean(node.description),
                excerpt=excerpt,
                excerpt_verified=ok,
            )
        )
        if len(nodes) >= MAX_NODES:
            break

    kept = {n.id for n in nodes}
    edges: list[GraphEdge] = []
    seen_edges: set[tuple[str, str]] = set()
    for edge in raw.edges:
        source = id_map.get(edge.source, _node_id(edge.source))
        target = id_map.get(edge.target, _node_id(edge.target))
        if source not in kept or target not in kept or source == target:
            continue
        key = (source, target)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        edges.append(GraphEdge(source=source, target=target, relation=_clean(edge.relation) or "relates to"))
        if len(edges) >= MAX_EDGES:
            break

    return Visualization(workflow=steps[:MAX_STEPS], nodes=nodes, edges=edges)
