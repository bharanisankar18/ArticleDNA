import type {
  AnalysisRecord,
  ArticleAnalysis,
  AssumptionBasis,
  ContentType,
  DirectionSource,
  EvidenceStrength,
  EvidenceType,
  KeyPoint,
  LimitationCategory,
  NodeGroup,
  StepKind,
} from '../shared/types';

export const STEP_LABEL: Record<StepKind, string> = {
  context: 'Context',
  problem: 'Problem',
  data: 'Data',
  method: 'Method',
  experiment: 'Experiment',
  result: 'Result',
  conclusion: 'Conclusion',
};

export const GROUP_LABEL: Record<NodeGroup, string> = {
  problem: 'Problem',
  method: 'Method',
  concept: 'Concept',
  data: 'Data',
  metric: 'Metric',
  finding: 'Finding',
  entity: 'Entity',
};

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  empirical: 'Empirical',
  example: 'Example',
  expert_opinion: 'Expert view',
  author_opinion: "Author's opinion",
  unsupported: 'Unsupported',
};

export const EVIDENCE_TYPE_HINT: Record<EvidenceType, string> = {
  empirical: 'Data, studies or measurements reported in the article',
  example: 'An anecdote or illustrative case',
  expert_opinion: 'The view of a source the article cites',
  author_opinion: "The author's own judgement",
  unsupported: 'Asserted without backing in the text',
};

export const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  strong: 'Strong support',
  moderate: 'Moderate support',
  weak: 'Weak support',
};

export const BASIS_LABEL: Record<AssumptionBasis, string> = {
  explicit: 'Stated by the author',
  inferred: 'Inferred by Gemini',
};

export const LIMITATION_LABEL: Record<LimitationCategory, string> = {
  missing_evidence: 'Missing evidence',
  methodology: 'Method',
  logic: 'Reasoning',
  scope: 'Scope',
  unanswered_question: 'Open question',
};

export const SOURCE_LABEL: Record<DirectionSource, string> = {
  author: 'From the author',
  ai_suggested: 'Suggested by Gemini',
};

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  research_paper: 'Research paper',
  news_report: 'News report',
  technical_article: 'Technical article',
  opinion_essay: 'Opinion',
  blog_post: 'Blog post',
  other: 'Article',
};

export function formatDate(value: string | null | undefined, style: 'short' | 'long' = 'short'): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return value;
  return new Intl.DateTimeFormat(undefined, style === 'long' ? { dateStyle: 'long' } : { dateStyle: 'medium' }).format(time);
}

export function formatRelative(value: string): string {
  const diff = Date.now() - Date.parse(value);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value) ?? value;
}

export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

/** "45 s", "12 min", "21 h" */
export function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 230));
}

// ---------------------------------------------------------------- copy / export
const quote = (text: string, verified: boolean) =>
  text ? `\n  > "${text}"${verified ? '' : ' _(not found word-for-word in the article)_'}` : '';

const block = (title: string, lines: string[]) =>
  lines.length ? [`### ${title}`, '', ...lines, ''].join('\n') : '';
const points = (title: string, list: KeyPoint[]) => block(title, list.map((p) => `- ${p.point}`));

function researchSummary(a: ArticleAnalysis): string {
  const r = a.research_summary;
  if (!r) return '';
  return [
    points('Abstract', r.abstract),
    points('Methodology', r.methodology),
    points('Key findings', r.key_findings),
    points('Research gap', r.research_gap),
    block('Limitations', a.limitations.map((l) => `- **${l.limitation}**: ${l.explanation}`)),
    block('Not covered by the article', a.missing_information.map((m) => `- ${m}`)),
    block('Future work', a.future_directions.map((d) => `- ${d.direction} (${SOURCE_LABEL[d.source].toLowerCase()})`)),
  ].join('');
}

function articleSummary(a: ArticleAnalysis): string {
  const s = a.article_summary;
  if (!s) return '';
  return [
    block('TL;DR', [s.tldr]),
    block('Key takeaways', a.key_takeaways.map((t) => `- ${t}`)),
    block('Core concepts', s.core_concepts.map((c) => `- **${c.term}**: ${c.explanation}`)),
    points('Important facts', s.important_facts),
    block('Statistics & data', s.statistics.map((x) => `- **${x.figure}**: ${x.context}`)),
    block('Key quotes', s.key_quotes.map((q) => `> "${q.quote}" (${q.speaker})`)),
    block('References & sources', s.references.map((r) => `- **${r.source}**: ${r.cited_for}`)),
    block('Further reading', s.further_reading.map((f) => `- ${f.topic}: ${f.reason}`)),
  ].join('');
}

export const sectionText = {
  summary: (a: ArticleAnalysis) =>
    `## Summary\n\n${a.central_topic ? `**Topic:** ${a.central_topic}\n\n` : ''}${
      a.summary_kind === 'research' ? researchSummary(a) : articleSummary(a)
    }`.trimEnd(),

  argument: (a: ArticleAnalysis) => {
    const m = a.main_argument;
    return [
      '## Main argument',
      '',
      `**Thesis:** ${m.thesis}`,
      '',
      `**What the author wants you to take away:** ${m.author_intent}`,
      '',
      `**Against other views:** ${m.contrast_with_other_views}`,
      m.supporting_excerpt ? `\n> "${m.supporting_excerpt}"${m.excerpt_verified ? '' : ' _(not found word-for-word)_'}` : '',
    ].join('\n');
  },

  evidence: (a: ArticleAnalysis) =>
    ['## Evidence', ''].concat(
      a.evidence.map(
        (e) =>
          `- **${e.claim}** (${EVIDENCE_TYPE_LABEL[e.evidence_type]}, ${STRENGTH_LABEL[e.strength].toLowerCase()})` +
          quote(e.excerpt, e.excerpt_verified) +
          `\n  ${e.explanation}`,
      ),
    ).join('\n'),

  assumptions: (a: ArticleAnalysis) =>
    ['## Assumptions', ''].concat(
      a.assumptions.map(
        (x) => `- **${x.assumption}** (${BASIS_LABEL[x.basis].toLowerCase()})` + quote(x.excerpt, x.excerpt_verified) + `\n  ${x.explanation}`,
      ),
    ).join('\n'),

  limitations: (a: ArticleAnalysis) => {
    const lines = ['## Limitations', ''];
    if (!a.limitations.length) lines.push('No limitations identified from the text.');
    lines.push(
      ...a.limitations.map(
        (l) => `- **${l.limitation}** (${LIMITATION_LABEL[l.category]})` + quote(l.excerpt, l.excerpt_verified) + `\n  ${l.explanation}`,
      ),
    );
    if (a.missing_information.length) {
      lines.push('', '**Not covered by the article:**', ...a.missing_information.map((m) => `- ${m}`));
    }
    return lines.join('\n');
  },

  directions: (a: ArticleAnalysis) =>
    ['## Future work', ''].concat(
      a.future_directions.map(
        (d) => `- **${d.direction}** (${SOURCE_LABEL[d.source].toLowerCase()})` + quote(d.excerpt, d.excerpt_verified) + `\n  ${d.rationale}`,
      ),
    ).join('\n'),

  takeaways: (a: ArticleAnalysis) =>
    ['## Key takeaways', ''].concat(a.key_takeaways.map((t) => `- ${t}`)).join('\n'),
};

export function recordToMarkdown(record: AnalysisRecord): string {
  const a = record.analysis;
  const byline = [record.author, formatDate(record.publishedDate, 'long'), record.siteName].filter(Boolean).join(', ');
  return [
    `# ${record.title}`,
    '',
    `<${record.url}>`,
    byline ? `\n${byline}` : '',
    '',
    `_ArticleDNA analysis, ${formatDate(record.meta.analyzed_at, 'long')} (${record.meta.model}). Quoted passages are the author's words; everything else is Gemini's reading of the article._`,
    '',
    sectionText.summary(a),
    '',
    sectionText.argument(a),
    '',
    sectionText.evidence(a),
    '',
    sectionText.assumptions(a),
    '',
    a.summary_kind === 'research' ? sectionText.takeaways(a) : a.limitations.length ? sectionText.limitations(a) : '',
    '',
  ].join('\n');
}

export function downloadText(filename: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'article'
  );
}
