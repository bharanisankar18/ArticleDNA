import { Readability, isProbablyReaderable } from '@mozilla/readability';
import type { ExtractedArticle, ExtractionResult } from '../shared/types';

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption',
  'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'br',
]);
const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed', 'video',
  'audio', 'button', 'input', 'select', 'textarea', 'form',
]);
// Removed before the fallback extractor runs on pages Readability can't parse.
const BOILERPLATE_SELECTOR = [
  'nav', 'header', 'footer', 'aside', 'form', '[role="navigation"]', '[role="banner"]',
  '[role="contentinfo"]', '[role="complementary"]', '[aria-hidden="true"]', '[hidden]',
  '.ad', '.ads', '.advert', '.advertisement', '[class*="cookie"]', '[id*="cookie"]',
  '[class*="newsletter"]', '[class*="subscribe"]', '[class*="related"]', '[class*="share"]',
].join(',');

// Ad slots, consent banners and promos. Removed before Readability runs, because Readability
// keeps short sibling blocks of the article (such as an "Advertisement: ..." strip) as content.
const NOISE_SELECTOR = [
  '[class~="ad"]', '[class~="ads"]', '[class^="ad-"]', '[class*=" ad-"]', '[id^="ad-"]', '[id^="ad_"]',
  '[class*="advert"]', '[id*="advert"]', '[class*="sponsor"]', '[data-ad]', '[data-ad-slot]',
  '[data-ad-unit]', 'ins.adsbygoogle', '[aria-label*="advertisement" i]', '[class*="cookie"]',
  '[id*="cookie"]', '[class*="consent"]', '[class*="newsletter-signup"]',
].join(',');
const AD_LABEL = /^(advertisement|sponsored|paid content|paid post)\b|^ad\s*:/i;

export function stripNoise(root: ParentNode) {
  // Ad slots are short. A long block that happens to match (say, a "sponsored-content" article
  // wrapper) is real content and stays.
  root.querySelectorAll(NOISE_SELECTOR).forEach((el) => {
    if ((el.textContent?.length ?? 0) < 800) el.remove();
  });
  root.querySelectorAll('div, section, aside, p, span, figure').forEach((el) => {
    const text = el.textContent?.trim() ?? '';
    if (text.length < 200 && AD_LABEL.test(text)) el.remove();
  });
}

/** Convert a DOM subtree to plain text, one paragraph per block element. */
export function blockText(root: Node): string {
  const paragraphs: string[] = [];
  let line = '';
  const flush = () => {
    const text = line.replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
    line = '';
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.textContent ?? '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    if (tag === 'li') line += '• ';
    node.childNodes.forEach(walk);
    if (block) flush();
  };
  walk(root);
  flush();
  return paragraphs.join('\n\n');
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}

function meta(doc: Document, ...selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = doc.querySelector<HTMLMetaElement>(selector)?.content?.trim();
    if (value) return value;
  }
  return null;
}

function metaAll(doc: Document, selector: string): string[] {
  return Array.from(doc.querySelectorAll<HTMLMetaElement>(selector))
    .map((m) => m.content.trim())
    .filter(Boolean);
}

interface JsonLdFacts {
  author?: string;
  datePublished?: string;
  headline?: string;
}

function readJsonLd(doc: Document): JsonLdFacts {
  const facts: JsonLdFacts = {};
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const obj = node as Record<string, unknown>;
    const type = String(obj['@type'] ?? '');
    if (/Article|Posting|Report|ScholarlyArticle|BlogPosting|NewsArticle/i.test(type)) {
      const author = obj.author;
      const names = (Array.isArray(author) ? author : [author])
        .map((a) => (typeof a === 'string' ? a : (a as Record<string, unknown> | undefined)?.name))
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
      if (names.length && !facts.author) facts.author = names.slice(0, 5).join(', ');
      if (typeof obj.datePublished === 'string' && !facts.datePublished) facts.datePublished = obj.datePublished;
      if (typeof obj.headline === 'string' && !facts.headline) facts.headline = obj.headline;
    }
    if (obj['@graph']) visit(obj['@graph']);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      visit(JSON.parse(script.textContent ?? ''));
    } catch {
      /* malformed JSON-LD is common; ignore it */
    }
  });
  return facts;
}

/** Turn a byline into names only, or null when it isn't one ("[Submitted on 4 Feb 2025]"). */
export function cleanAuthor(value: string | null | undefined): string | null {
  if (!value) return null;
  let cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^(authors?|by|written by|von|par|por)\s*:?\s+/i, '')
    .replace(/\s*\b(affiliations?|department|university of|institute)\b.*$/i, '')
    .replace(/\S+@\S+/g, '')
    .replace(/[,;\s]+$/, '')
    .trim();
  if (!cleaned || /^https?:\/\//.test(cleaned)) return null;
  // Dates, brackets and submission notes are not names.
  if (/[\d[\]{}|<>]|submitted|received|accepted|published|updated|copyright|©/i.test(cleaned)) return null;
  const names = cleaned.split(/\s*(?:,|;|\band\b|&)\s*/i).filter(Boolean);
  if (names.length > 3) cleaned = `${names.slice(0, 3).join(', ')} et al.`;
  return cleaned.length > 160 ? null : cleaned;
}

function cleanDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // A leading calendar date is taken as written: converting through UTC would shift it a day
  // for publishers (or readers) in other time zones.
  const literal = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (literal) {
    const [, y, m, d] = literal;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const year = date.getFullYear();
    if (year > 1800 && year < 2200) {
      return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
  }
  return trimmed.length <= 40 ? trimmed : null;
}

function isPdf(doc: Document): boolean {
  if (doc.contentType === 'application/pdf') return true;
  const embed = doc.querySelector('embed[type="application/pdf"]');
  return !!embed && (doc.body?.children.length ?? 0) <= 2;
}

export function extractArticle(doc: Document = document): ExtractionResult {
  if (isPdf(doc)) {
    return {
      ok: false,
      code: 'pdf',
      message: "PDF files open in Chrome's built-in viewer, which extensions can't read.",
    };
  }

  const readerable = (() => {
    try {
      return isProbablyReaderable(doc);
    } catch {
      return false;
    }
  })();

  let parsed: ReturnType<Readability<string>['parse']> = null;
  try {
    const clone = doc.cloneNode(true) as Document;
    stripNoise(clone);
    parsed = new Readability(clone, { charThreshold: 250 }).parse();
  } catch {
    parsed = null;
  }

  let content = '';
  let method: ExtractedArticle['method'] = 'readability';
  if (parsed?.content) {
    const container = new DOMParser().parseFromString(parsed.content, 'text/html').body;
    content = blockText(container);
  }
  if (countWords(content) < 60 && doc.body) {
    // Readability found nothing useful: fall back to the page body minus obvious boilerplate.
    const clone = doc.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(BOILERPLATE_SELECTOR).forEach((el) => el.remove());
    stripNoise(clone);
    const fallback = blockText(clone);
    if (countWords(fallback) > countWords(content)) {
      content = fallback;
      method = 'fallback';
    }
  }
  content = content.replace(/\n{3,}/g, '\n\n').trim();
  const wordCount = countWords(content);
  if (wordCount === 0) {
    return { ok: false, code: 'empty', message: 'No readable text was found on this page.' };
  }

  const ld = readJsonLd(doc);
  const citationAuthors = metaAll(doc, 'meta[name="citation_author"]');
  // Scholarly metadata is the most reliable source; on-page bylines are the least.
  const citationNames = citationAuthors
    .map((name) => (/^[^,]+,\s*[^,]+$/.test(name) ? name.split(/,\s*/).reverse().join(' ') : name)) // "Allal, Loubna"
    .map((name) => cleanAuthor(name))
    .filter((name): name is string => !!name);
  const author =
    (citationNames.length ? cleanAuthor(citationNames.join(', ')) : null) ??
    cleanAuthor(meta(doc, 'meta[name="author"]', 'meta[property="article:author"]', 'meta[name="dc.creator"]', 'meta[name="DC.creator"]')) ??
    cleanAuthor(ld.author) ??
    cleanAuthor(parsed?.byline) ??
    cleanAuthor(doc.querySelector('[rel="author"]')?.textContent);

  const publishedDate =
    cleanDate(parsed?.publishedTime) ??
    cleanDate(
      meta(
        doc,
        'meta[property="article:published_time"]',
        'meta[name="citation_publication_date"]',
        'meta[name="citation_date"]',
        'meta[name="dc.date"]',
        'meta[name="DC.date"]',
        'meta[name="date"]',
        'meta[itemprop="datePublished"]',
      ),
    ) ??
    cleanDate(ld.datePublished) ??
    cleanDate(doc.querySelector('time[datetime]')?.getAttribute('datetime'));

  const title =
    parsed?.title?.trim() ||
    meta(doc, 'meta[name="citation_title"]', 'meta[property="og:title"]') ||
    ld.headline ||
    doc.title.trim() ||
    location.hostname;

  const siteName =
    parsed?.siteName?.trim() ||
    meta(doc, 'meta[property="og:site_name"]', 'meta[name="citation_journal_title"]') ||
    location.hostname.replace(/^www\./, '');

  return {
    ok: true,
    article: {
      title,
      url: location.href,
      author,
      publishedDate,
      siteName,
      language: doc.documentElement.lang || parsed?.lang || null,
      content,
      wordCount,
      readerable,
      method,
    },
  };
}
