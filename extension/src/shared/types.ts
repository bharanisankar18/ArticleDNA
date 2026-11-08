// ---------------------------------------------------------------- page extraction
export interface ExtractedArticle {
  title: string;
  url: string;
  author: string | null;
  publishedDate: string | null;
  siteName: string | null;
  language: string | null;
  content: string;
  wordCount: number;
  /** False when Readability doesn't think the page is an article. */
  readerable: boolean;
  method: 'readability' | 'fallback';
}

export type ExtractionFailureCode = 'pdf' | 'empty' | 'unknown';

export type ExtractionResult =
  | { ok: true; article: ExtractedArticle }
  | { ok: false; code: ExtractionFailureCode; message: string };

// ---------------------------------------------------------------- highlighting
export type LocateStatus = 'exact' | 'approximate' | 'not_found';

export interface LocateResult {
  status: LocateStatus;
  /** The page text that was highlighted (for approximate matches). */
  matchedText?: string;
}

// ---------------------------------------------------------------- backend analysis
export type EvidenceType = 'empirical' | 'example' | 'expert_opinion' | 'author_opinion' | 'unsupported';
export type EvidenceStrength = 'strong' | 'moderate' | 'weak';
export type AssumptionBasis = 'explicit' | 'inferred';
export type LimitationCategory = 'missing_evidence' | 'methodology' | 'logic' | 'scope' | 'unanswered_question';
export type DirectionSource = 'author' | 'ai_suggested';
export type ContentType =
  | 'research_paper'
  | 'news_report'
  | 'technical_article'
  | 'opinion_essay'
  | 'blog_post'
  | 'other';

/** A point in Gemini's words, anchored to a passage in the article for "Find in page". */
export interface KeyPoint {
  point: string;
  excerpt: string;
  excerpt_verified: boolean;
}

export interface ResearchSummary {
  abstract: KeyPoint[];
  methodology: KeyPoint[];
  key_findings: KeyPoint[];
  research_gap: KeyPoint[];
}

export interface ArticleSummary {
  tldr: string;
  core_concepts: Array<{ term: string; explanation: string; excerpt: string; excerpt_verified: boolean }>;
  important_facts: KeyPoint[];
  statistics: Array<{ figure: string; context: string; excerpt: string; excerpt_verified: boolean }>;
  /** Only quotes found word-for-word in the article. */
  key_quotes: Array<{ quote: string; speaker: string }>;
  references: Array<{ source: string; cited_for: string; excerpt: string; excerpt_verified: boolean }>;
  further_reading: Array<{ topic: string; reason: string }>;
}

export interface ArticleAnalysis {
  content_assessment: { content_type: ContentType; is_analyzable: boolean; note: string };
  central_topic: string;
  summary_kind: 'research' | 'article';
  research_summary: ResearchSummary | null;
  article_summary: ArticleSummary | null;
  main_argument: {
    thesis: string;
    author_intent: string;
    contrast_with_other_views: string;
    supporting_excerpt: string;
    excerpt_verified: boolean;
  };
  evidence: Array<{
    claim: string;
    excerpt: string;
    evidence_type: EvidenceType;
    explanation: string;
    strength: EvidenceStrength;
    excerpt_verified: boolean;
  }>;
  assumptions: Array<{
    assumption: string;
    basis: AssumptionBasis;
    explanation: string;
    excerpt: string;
    excerpt_verified: boolean;
  }>;
  limitations: Array<{
    limitation: string;
    category: LimitationCategory;
    explanation: string;
    excerpt: string;
    excerpt_verified: boolean;
  }>;
  future_directions: Array<{
    direction: string;
    source: DirectionSource;
    rationale: string;
    excerpt: string;
    excerpt_verified: boolean;
  }>;
  key_takeaways: string[];
  missing_information: string[];
}

export interface AnalysisMeta {
  model: string;
  analyzed_at: string;
  processing_ms: number;
  input_chars: number;
  input_words: number;
  excerpts_total: number;
  excerpts_verified: number;
}

export interface AnalyzeResponse {
  analysis: ArticleAnalysis;
  meta: AnalysisMeta;
}

// ---------------------------------------------------------------- visualization
export type StepKind = 'context' | 'problem' | 'data' | 'method' | 'experiment' | 'result' | 'conclusion';
export type NodeGroup = 'problem' | 'method' | 'concept' | 'data' | 'metric' | 'finding' | 'entity';

export interface Visualization {
  workflow: Array<{ title: string; detail: string; kind: StepKind; excerpt: string; excerpt_verified: boolean }>;
  nodes: Array<{
    id: string;
    label: string;
    group: NodeGroup;
    description: string;
    excerpt: string;
    excerpt_verified: boolean;
  }>;
  edges: Array<{ source: string; target: string; relation: string }>;
}

export interface VisualizeResponse {
  visual: Visualization;
  meta: { model: string; generated_at: string; processing_ms: number };
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  /** True when any AI provider is configured. */
  gemini_configured: boolean;
  model: string;
  providers?: Array<{ name: string; label: string; model: string; status: 'ready' | 'cooling_down' }>;
  limits: { max_content_chars: number; min_content_words: number };
}

// ---------------------------------------------------------------- stored records
export interface AnalysisRecord {
  id: string;
  url: string;
  urlKey: string;
  title: string;
  siteName: string | null;
  author: string | null;
  publishedDate: string | null;
  wordCount: number;
  truncated: boolean;
  analysis: ArticleAnalysis;
  meta: AnalysisMeta;
  visual?: Visualization | null;
}

/** A row in the History or Saved list. */
export interface CollectionEntry {
  id: string;
  url: string;
  urlKey: string;
  title: string;
  siteName: string | null;
  topic: string;
  analyzedAt: string;
  addedAt: string;
}

export interface Settings {
  backendUrl: string;
  keepHistory: boolean;
}
