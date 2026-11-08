import { beforeEach, describe, expect, it, vi } from 'vitest';
import { urlKey } from '../shared/url';
import type { AnalysisRecord } from '../shared/types';
import { analyzeArticle, ApiError, prepareContent } from './api';
import { recordToMarkdown } from './format';

// ---------------------------------------------------------------- chrome.storage mock
const store = new Map<string, unknown>();
const listeners: Array<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void> = [];
const local = {
  get: async (key: string) => (store.has(key) ? { [key]: structuredClone(store.get(key)) } : {}),
  set: async (items: Record<string, unknown>) => {
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [k, v] of Object.entries(items)) {
      changes[k] = { oldValue: store.get(k), newValue: v };
      store.set(k, structuredClone(v));
    }
    listeners.forEach((l) => l(changes, 'local'));
  },
  remove: async (keys: string | string[]) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
  },
};
vi.stubGlobal('chrome', {
  storage: {
    local,
    onChanged: { addListener: (l: (typeof listeners)[number]) => listeners.push(l), removeListener: () => undefined },
  },
});

const storage = await import('./storage');
const { addToCollection, removeFromCollection, getCollection, getRecord, getSettings, saveSettings, clearCollection } = storage;

const point = (text: string) => ({ point: text, excerpt: '', excerpt_verified: false });

function record(id: string, url: string): AnalysisRecord {
  return {
    id,
    url,
    urlKey: urlKey(url),
    title: `Article ${id}`,
    siteName: 'Example',
    author: null,
    publishedDate: null,
    wordCount: 900,
    truncated: false,
    meta: {
      model: 'gemini-3.6-flash',
      analyzed_at: '2026-11-06T10:00:00Z',
      processing_ms: 12000,
      input_chars: 5000,
      input_words: 900,
      excerpts_total: 1,
      excerpts_verified: 1,
    },
    analysis: {
      content_assessment: { content_type: 'news_report', is_analyzable: true, note: '' },
      central_topic: 'Topic',
      summary_kind: 'research',
      research_summary: {
        abstract: [point('About this.')],
        methodology: [point('A survey.')],
        key_findings: [point('It works.')],
        research_gap: [],
      },
      article_summary: null,
      main_argument: {
        thesis: 'Thesis.',
        author_intent: 'Intent.',
        contrast_with_other_views: 'Contrast.',
        supporting_excerpt: 'A quoted line.',
        excerpt_verified: true,
      },
      evidence: [
        {
          claim: 'Claim',
          excerpt: 'Quote',
          evidence_type: 'empirical',
          explanation: 'Why',
          strength: 'strong',
          excerpt_verified: false,
        },
      ],
      assumptions: [],
      limitations: [],
      future_directions: [],
      key_takeaways: ['One'],
      missing_information: ['Methods'],
    },
  };
}

beforeEach(() => store.clear());

describe('storage', () => {
  it('keeps history and saved separately, sharing one stored record', async () => {
    await addToCollection('history', record('a', 'https://example.com/one'));
    await addToCollection('history', record('b', 'https://example.com/two'));
    await addToCollection('saved', record('a', 'https://example.com/one'));
    expect((await getCollection('history')).map((e) => e.id)).toEqual(['b', 'a']); // newest first
    expect((await getCollection('saved')).map((e) => e.id)).toEqual(['a']);
    expect((await getCollection('saved'))[0].topic).toBe('Topic');

    // Removing from history keeps a saved record; removing it from both deletes it.
    await removeFromCollection('history', 'a');
    expect(await getRecord('a')).not.toBeNull();
    await removeFromCollection('saved', 'a');
    expect(await getRecord('a')).toBeNull();

    await clearCollection('history');
    expect(await getCollection('history')).toEqual([]);
    expect(await getRecord('b')).toBeNull();
  });

  it('replaces an older analysis of the same article', async () => {
    await addToCollection('history', record('old', 'https://example.com/story?utm_source=x'));
    await addToCollection('history', record('new', 'https://www.example.com/story#comments'));
    expect((await getCollection('history')).map((e) => e.id)).toEqual(['new']);
    expect(await getRecord('old')).toBeNull();
  });

  it('moves the old auto-saved library into history and fills in new sections', async () => {
    const legacy = record('legacy', 'https://example.com/legacy') as unknown as Record<string, unknown>;
    const analysis = { ...(legacy.analysis as Record<string, unknown>) };
    delete analysis.research_summary;
    delete analysis.article_summary;
    delete analysis.summary_kind;
    delete analysis.central_topic;
    analysis.summary = { central_topic: 'Old topic', overview: 'Old overview.' };
    store.set('library:index', [{ id: 'legacy' }]);
    store.set('library:item:legacy', { ...legacy, analysis });
    storage.__resetMigrationForTests();

    expect((await getCollection('history')).map((e) => e.id)).toEqual(['legacy']);
    const migrated = await getRecord('legacy');
    expect(migrated?.analysis.central_topic).toBe('Old topic');
    expect(migrated?.analysis.research_summary?.abstract[0].point).toBe('Old overview.');
    expect(store.has('library:index')).toBe(false);
  });

  it('merges settings with defaults', async () => {
    expect((await getSettings()).backendUrl).toBe('http://localhost:8000');
    await saveSettings({ keepHistory: false });
    expect(await getSettings()).toEqual({ backendUrl: 'http://localhost:8000', keepHistory: false });
  });
});

describe('urlKey', () => {
  it('ignores fragments, tracking parameters, www and trailing slashes', () => {
    expect(urlKey('https://www.Example.com/a/?utm_medium=email&id=3#top')).toBe('https://example.com/a?id=3');
  });
});

describe('prepareContent', () => {
  it('leaves short text alone', () => {
    expect(prepareContent('short', 100)).toEqual({ text: 'short', truncated: false });
  });
  it('cuts long text at a paragraph boundary', () => {
    const text = `${'a'.repeat(90)}\n\n${'b'.repeat(50)}`;
    const out = prepareContent(text, 100);
    expect(out.truncated).toBe(true);
    expect(out.text).toBe('a'.repeat(90));
  });
});

describe('analyzeArticle', () => {
  const article = {
    title: 'T',
    url: 'https://example.com/x',
    author: null,
    publishedDate: null,
    siteName: null,
    language: 'en',
    content: 'text',
    wordCount: 1,
    readerable: true,
    method: 'readability' as const,
  };

  it('turns a server error body into an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Slow down', retryable: true, retry_after_seconds: 30 } }), {
          status: 429,
        }),
      ),
    );
    const error = await analyzeArticle('http://localhost:8000', article, 'text').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('reports an unreachable server clearly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await analyzeArticle('http://localhost:8000', article, 'text').catch((e) => e);
    expect(error.code).toBe('BACKEND_UNREACHABLE');
  });

  it('rejects a malformed success response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ analysis: { summary: 'nope' } }), { status: 200 })));
    const error = await analyzeArticle('http://localhost:8000', article, 'text').catch((e) => e);
    expect(error.code).toBe('BAD_RESPONSE');
  });
});

describe('recordToMarkdown', () => {
  it('marks unverified quotes', () => {
    const md = recordToMarkdown(record('a', 'https://example.com/one'));
    expect(md).toContain('# Article a');
    expect(md).toContain('> "A quoted line."');
    expect(md).toContain('not found word-for-word');
    expect(md).toContain('### Not covered by the article');
  });
});
