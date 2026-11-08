/**
 * Local persistence with chrome.storage.local. Nothing here leaves the browser.
 *
 * Layout:
 *   settings          Settings
 *   record:<id>       AnalysisRecord     (full analysis, loaded on demand)
 *   history:index     CollectionEntry[]  every article analyzed (newest first, one per article)
 *   saved:index       CollectionEntry[]  articles the reader chose to save
 *
 * A record is kept while either list refers to it.
 */
import { DEFAULT_BACKEND_URL, LIBRARY_LIMIT } from '../shared/constants';
import type { AnalysisRecord, CollectionEntry, KeyPoint, Settings } from '../shared/types';

const SETTINGS_KEY = 'settings';
export type Collection = 'history' | 'saved';
const INDEX_KEY: Record<Collection, string> = { history: 'history:index', saved: 'saved:index' };
const recordKey = (id: string) => `record:${id}`;

// Before History/Saved existed, every analysis went into one auto-saved library.
const LEGACY_INDEX = 'library:index';
const legacyItemKey = (id: string) => `library:item:${id}`;

export const DEFAULT_SETTINGS: Settings = { backendUrl: DEFAULT_BACKEND_URL, keepHistory: true };

const area = (): chrome.storage.StorageArea => chrome.storage.local;

async function read<T>(key: string): Promise<T | undefined> {
  return (await area().get(key))[key] as T | undefined;
}

// ---------------------------------------------------------------- migration
let migration: Promise<void> | null = null;

function migrate(): Promise<void> {
  migration ??= (async () => {
    const legacy = await read<Array<{ id: string }>>(LEGACY_INDEX);
    if (!Array.isArray(legacy)) return;
    const history: CollectionEntry[] = [];
    const writes: Record<string, unknown> = {};
    for (const entry of legacy) {
      const record = await read<AnalysisRecord>(legacyItemKey(entry.id));
      if (!record) continue;
      const normalized = normalizeRecord(record);
      writes[recordKey(record.id)] = normalized;
      history.push(toEntry(normalized, new Date().toISOString()));
    }
    const existing = (await read<CollectionEntry[]>(INDEX_KEY.history)) ?? [];
    writes[INDEX_KEY.history] = [...existing, ...history].slice(0, LIBRARY_LIMIT);
    await area().set(writes);
    await area().remove([LEGACY_INDEX, ...legacy.map((e) => legacyItemKey(e.id))]);
  })();
  return migration;
}

/** Test hook: run the legacy migration again. */
export function __resetMigrationForTests() {
  migration = null;
}

/** Fill in sections that records from older versions don't have. */
export function normalizeRecord(record: AnalysisRecord): AnalysisRecord {
  type Legacy = AnalysisRecord['analysis'] & {
    summary?: { central_topic?: string; overview?: string };
    abstract?: KeyPoint[];
    methodology?: KeyPoint[];
    key_findings?: KeyPoint[];
    research_gap?: KeyPoint[];
  };
  const a = record.analysis as Legacy;
  if (a.summary_kind) return record;
  const point = (text?: string): KeyPoint[] => (text ? [{ point: text, excerpt: '', excerpt_verified: false }] : []);
  const { summary, abstract, methodology, key_findings, research_gap, ...rest } = a;
  return {
    ...record,
    analysis: {
      ...rest,
      central_topic: a.central_topic ?? summary?.central_topic ?? '',
      // The first redesign stored research sections at the top level; the original, a plain summary.
      summary_kind: 'research',
      research_summary: {
        abstract: abstract ?? point(summary?.overview),
        methodology: methodology ?? [],
        key_findings: key_findings ?? [],
        research_gap: research_gap ?? [],
      },
      article_summary: null,
    },
  };
}

// ---------------------------------------------------------------- settings
export async function getSettings(): Promise<Settings> {
  const stored = (await read<Partial<Settings>>(SETTINGS_KEY)) ?? {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await area().set({ [SETTINGS_KEY]: next });
  return next;
}

// ---------------------------------------------------------------- collections
export async function getCollection(kind: Collection): Promise<CollectionEntry[]> {
  await migrate();
  const index = await read<CollectionEntry[]>(INDEX_KEY[kind]);
  return Array.isArray(index) ? index : [];
}

export async function getRecord(id: string): Promise<AnalysisRecord | null> {
  await migrate();
  const record = await read<AnalysisRecord>(recordKey(id));
  return record ? normalizeRecord(record) : null;
}

function toEntry(record: AnalysisRecord, addedAt: string): CollectionEntry {
  return {
    id: record.id,
    url: record.url,
    urlKey: record.urlKey,
    title: record.title,
    siteName: record.siteName,
    topic: record.analysis.central_topic,
    analyzedAt: record.meta.analyzed_at,
    addedAt,
  };
}

/** Delete records that neither list refers to any more. */
async function collect(ids: string[]) {
  if (!ids.length) return;
  const [history, saved] = await Promise.all([getCollection('history'), getCollection('saved')]);
  const live = new Set([...history, ...saved].map((e) => e.id));
  const dead = ids.filter((id) => !live.has(id)).map(recordKey);
  if (dead.length) await area().remove(dead);
}

/** Add (or move to the top) a record in a collection. A newer analysis of the same article replaces the older. */
export async function addToCollection(kind: Collection, record: AnalysisRecord): Promise<void> {
  const index = await getCollection(kind);
  const replaced = index.filter((e) => e.urlKey === record.urlKey && e.id !== record.id).map((e) => e.id);
  let next = [toEntry(record, new Date().toISOString()), ...index.filter((e) => e.id !== record.id && e.urlKey !== record.urlKey)];
  const overflow = next.slice(LIBRARY_LIMIT).map((e) => e.id);
  next = next.slice(0, LIBRARY_LIMIT);
  await area().set({ [recordKey(record.id)]: record, [INDEX_KEY[kind]]: next });
  await collect([...replaced, ...overflow]);
}

export async function removeFromCollection(kind: Collection, id: string): Promise<void> {
  const index = await getCollection(kind);
  await area().set({ [INDEX_KEY[kind]]: index.filter((e) => e.id !== id) });
  await collect([id]);
}

export async function clearCollection(kind: Collection): Promise<void> {
  const index = await getCollection(kind);
  await area().remove(INDEX_KEY[kind]);
  await collect(index.map((e) => e.id));
}

/** Update a stored record in place (e.g. to attach diagrams), if it is still stored. */
export async function updateRecord(record: AnalysisRecord): Promise<void> {
  if (await read(recordKey(record.id))) await area().set({ [recordKey(record.id)]: record });
}

export function onCollectionsChanged(listener: () => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && (INDEX_KEY.history in changes || INDEX_KEY.saved in changes)) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === 'local' && SETTINGS_KEY in changes) {
      listener({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings>) });
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
