/**
 * Locating quoted passages in page text.
 *
 * Text is compared on letters and digits only (NFKC-normalised, lower-cased), so a quote still
 * matches when it differs from the page only in whitespace, punctuation, quote marks or dashes.
 * This mirrors the backend's excerpt verification (backend/services/text_tools.py).
 *
 * Matching is deliberately conservative: an "approximate" result requires most of the quote to be
 * present, in order, in one compact stretch of the page. Anything weaker is reported as not found
 * rather than highlighting a passage that merely looks similar.
 */

const ALNUM = /[\p{L}\p{N}]/u;
const ELLIPSIS = /\.\.\.|…|\[\s*\.\.\.\s*\]/;
export const MIN_QUOTE_CHARS = 12;
const CHUNK = 24;
const APPROX_MIN_COVERAGE = 0.6;

export function normalizeForMatch(text: string): string {
  let out = '';
  for (const ch of text.normalize('NFKC').toLowerCase()) {
    if (ALNUM.test(ch)) out += ch;
  }
  return out;
}

/** A span in normalised-text coordinates: [start, end). */
export interface Span {
  start: number;
  end: number;
}

export type MatchResult =
  | { status: 'exact'; spans: Span[] }
  | { status: 'approximate'; spans: Span[]; coverage: number }
  | { status: 'not_found' };

function findSegmentsInOrder(haystack: string, segments: string[]): Span[] | null {
  const spans: Span[] = [];
  let from = 0;
  for (const segment of segments) {
    const at = haystack.indexOf(segment, from);
    if (at < 0) return null;
    spans.push({ start: at, end: at + segment.length });
    from = at + segment.length;
  }
  return spans;
}

/**
 * Find `quote` inside `haystack` (already normalised with normalizeForMatch).
 */
export function matchQuote(haystack: string, quote: string): MatchResult {
  const segments = quote
    .split(ELLIPSIS)
    .map(normalizeForMatch)
    .filter((s) => s.length > 0);
  const total = segments.reduce((n, s) => n + s.length, 0);
  if (!segments.length || total < MIN_QUOTE_CHARS) return { status: 'not_found' };

  // 1. Verbatim (each elided piece present, in order). Prefer the first occurrence.
  const exact = findSegmentsInOrder(haystack, segments);
  if (exact) return { status: 'exact', spans: exact };

  // 2. Approximate: split the quote into fixed chunks and look for a compact, ordered run of them.
  const whole = segments.join('');
  if (whole.length < CHUNK * 2) return { status: 'not_found' };
  const chunks: Array<{ text: string; offset: number }> = [];
  for (let i = 0; i + CHUNK <= whole.length; i += CHUNK) {
    chunks.push({ text: whole.slice(i, i + CHUNK), offset: i });
  }
  const tail = whole.slice(-CHUNK);
  if (chunks[chunks.length - 1].offset + CHUNK < whole.length) {
    chunks.push({ text: tail, offset: whole.length - CHUNK });
  }

  let best: { start: number; end: number; hits: number } | null = null;
  // Try each chunk occurrence as an anchor, then greedily extend forward.
  for (let a = 0; a < chunks.length; a++) {
    let anchorAt = haystack.indexOf(chunks[a].text);
    let guard = 0;
    while (anchorAt >= 0 && guard++ < 20) {
      const start = anchorAt - chunks[a].offset; // where the quote would begin
      const windowEnd = start + Math.ceil(whole.length * 1.25) + CHUNK;
      let hits = 1;
      let cursor = anchorAt + CHUNK;
      let lastEnd = cursor;
      for (let b = a + 1; b < chunks.length; b++) {
        const at = haystack.indexOf(chunks[b].text, cursor);
        if (at >= 0 && at + CHUNK <= windowEnd) {
          hits++;
          cursor = at + CHUNK;
          lastEnd = cursor;
        }
      }
      if (!best || hits > best.hits) best = { start: anchorAt, end: lastEnd, hits };
      anchorAt = haystack.indexOf(chunks[a].text, anchorAt + 1);
    }
  }
  if (!best) return { status: 'not_found' };
  const coverage = best.hits / chunks.length;
  const span = best.end - best.start;
  if (coverage < APPROX_MIN_COVERAGE || span > whole.length * 1.4 + CHUNK) return { status: 'not_found' };
  return { status: 'approximate', spans: [{ start: best.start, end: best.end }], coverage };
}
