import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, BookmarkCheck, History as HistoryIcon, Search, Trash2 } from 'lucide-react';
import { ArticleHeader } from '../../components/ArticleHeader';
import { Dashboard } from '../../components/dashboard/Dashboard';
import { DecodingLoader } from '../../components/Loader';
import { AnalysisError } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Button, Divider, IconButton } from '../../components/ui';
import { VisualPanel } from '../../components/visual/VisualPanel';
import { ActionTile, ResultTabs, type ResultTab } from '../../components/workspace';
import type { PageState } from '../../hooks/useActivePage';
import type { Collections } from '../../hooks/useLibrary';
import type { Locator } from '../../hooks/useLocate';
import { ApiError, prepareContent, visualizeArticle } from '../../services/api';
import { formatRelative } from '../../services/format';
import { locateInTab } from '../../services/pageBridge';
import { addToCollection, clearCollection, getRecord, removeFromCollection, updateRecord, type Collection } from '../../services/storage';
import type { AnalysisRecord, CollectionEntry, Settings } from '../../shared/types';
import { urlKey } from '../../shared/url';

const COPY = {
  saved: {
    title: 'Saved',
    empty: 'Nothing saved yet',
    emptyBody: 'Save an analysis with the bookmark button to keep it here.',
    icon: Bookmark,
  },
  history: {
    title: 'History',
    empty: 'No history yet',
    emptyBody: 'Every article you analyze appears here, so you can come back to it.',
    icon: HistoryIcon,
  },
} as const;

export function CollectionView({
  kind,
  collections,
  page,
  settings,
  maxChars,
  openId,
  onOpen,
  onGoToExplore,
}: {
  kind: Collection;
  collections: Collections;
  page: PageState;
  settings: Settings;
  maxChars: number;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onGoToExplore: () => void;
}) {
  if (openId) {
    return (
      <RecordView
        id={openId}
        backLabel={COPY[kind].title}
        page={page}
        settings={settings}
        maxChars={maxChars}
        savedIds={new Set(collections.saved.map((e) => e.id))}
        onBack={() => onOpen(null)}
      />
    );
  }
  return (
    <CollectionList
      kind={kind}
      entries={collections[kind]}
      savedIds={new Set(collections.saved.map((e) => e.id))}
      loaded={collections.loaded}
      historyOff={kind === 'history' && !settings.keepHistory}
      onOpen={onOpen}
      onGoToExplore={onGoToExplore}
    />
  );
}

function CollectionList({
  kind,
  entries,
  savedIds,
  loaded,
  historyOff,
  onOpen,
  onGoToExplore,
}: {
  kind: Collection;
  entries: CollectionEntry[];
  savedIds: Set<string>;
  loaded: boolean;
  historyOff: boolean;
  onOpen: (id: string) => void;
  onGoToExplore: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const copy = COPY[kind];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => `${e.title} ${e.topic} ${e.siteName ?? ''}`.toLowerCase().includes(q));
  }, [entries, query]);

  const remove = async (entry: CollectionEntry) => {
    const record = await getRecord(entry.id);
    await removeFromCollection(kind, entry.id);
    toast.show(kind === 'saved' ? 'Removed from Saved' : 'Removed from history', {
      duration: 5000,
      action: record ? { label: 'Undo', run: () => void addToCollection(kind, record) } : undefined,
    });
  };

  const toggleSaved = async (entry: CollectionEntry) => {
    if (savedIds.has(entry.id)) {
      await removeFromCollection('saved', entry.id);
      toast.show('Removed from Saved');
    } else {
      const record = await getRecord(entry.id);
      if (record) {
        await addToCollection('saved', record);
        toast.show('Saved');
      }
    }
  };

  if (loaded && entries.length === 0) {
    const Icon = copy.icon;
    return (
      <div className="fade-in px-6 pt-14 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-cream text-ink">
          <Icon size={22} />
        </div>
        <h2 className="mt-4 text-heading font-semibold text-ink">{copy.empty}</h2>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-small text-ink-2">
          {historyOff ? 'History is turned off in Settings.' : copy.emptyBody}
        </p>
        <Button size="sm" variant="primary" className="mt-5" onClick={onGoToExplore}>
          Explore the current page
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-display font-bold tracking-[-0.018em] text-ink">{copy.title}</h1>
        {kind === 'history' && entries.length > 0 &&
          (confirmClear ? (
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await clearCollection('history');
                  setConfirmClear(false);
                  toast.show('History cleared');
                }}
              >
                Clear history
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
              Clear
            </Button>
          ))}
      </div>
      {entries.length > 4 && (
        <label className="mt-3 flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-sheet px-3 focus-within:border-indigo">
          <Search size={15} className="shrink-0 text-ink-3" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${copy.title.toLowerCase()}`}
            aria-label={`Search ${copy.title.toLowerCase()}`}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      )}
      <ul className="mt-3 divide-y divide-line">
        {filtered.map((entry) => {
          const isSaved = savedIds.has(entry.id);
          return (
            <li key={entry.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(entry.id)}
                className="-mx-2 block w-[calc(100%+16px)] rounded-[10px] px-2 py-3 pr-[72px] text-left transition-colors duration-150 hover:bg-sheet"
              >
                <p className="line-clamp-2 text-body font-semibold text-ink">{entry.title}</p>
                {entry.topic && <p className="mt-0.5 line-clamp-1 text-small text-ink-2">{entry.topic}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-ink-3">
                  {[entry.siteName, formatRelative(entry.analyzedAt)].filter(Boolean).map((part, i) => (
                    <Fragment key={i}>
                      {i > 0 && <Divider />}
                      <span>{part}</span>
                    </Fragment>
                  ))}
                </p>
              </button>
              <div className="absolute top-2.5 right-0 flex">
                {kind === 'history' && (
                  <IconButton
                    label={isSaved ? 'Remove from Saved' : 'Save'}
                    onClick={() => toggleSaved(entry)}
                    className={isSaved ? 'text-indigo' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}
                  >
                    {isSaved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                  </IconButton>
                )}
                <IconButton
                  label={kind === 'saved' ? `Remove ${entry.title} from Saved` : `Remove ${entry.title} from history`}
                  onClick={() => remove(entry)}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {filtered.length === 0 && <p className="py-6 text-center text-small text-ink-3">Nothing matches "{query}".</p>}
    </div>
  );
}

type VisualRun = { kind: 'idle' } | { kind: 'running'; startedAt: number; controller: AbortController } | { kind: 'error'; error: ApiError };

function RecordView({
  id,
  backLabel,
  page,
  settings,
  maxChars,
  savedIds,
  onBack,
}: {
  id: string;
  backLabel: string;
  page: PageState;
  settings: Settings;
  maxChars: number;
  savedIds: Set<string>;
  onBack: () => void;
}) {
  const toast = useToast();
  const [record, setRecord] = useState<AnalysisRecord | null | undefined>(undefined);
  const [tab, setTab] = useState<ResultTab>('analysis');
  const [visualRun, setVisualRun] = useState<VisualRun>({ kind: 'idle' });

  useEffect(() => {
    let alive = true;
    getRecord(id).then((r) => alive && setRecord(r));
    return () => {
      alive = false;
    };
  }, [id]);

  const onArticle = record && page.kind === 'ready' && urlKey(page.article.url) === record.urlKey ? page : null;
  const locator = useMemo<Locator>(() => {
    const open = () => record && chrome.tabs.create({ url: record.url, active: true });
    if (onArticle) return { availability: 'ready', locate: (q) => locateInTab(onArticle.tabId, q), openArticle: open };
    return { availability: 'other-page', locate: async () => ({ status: 'not_found' }), openArticle: open };
  }, [record, onArticle]);

  const drawDiagrams = async () => {
    if (!record || !onArticle) return;
    const controller = new AbortController();
    setVisualRun({ kind: 'running', startedAt: Date.now(), controller });
    try {
      const prepared = prepareContent(onArticle.article.content, maxChars);
      const { visual } = await visualizeArticle(settings.backendUrl, onArticle.article, prepared.text, controller.signal);
      const next = { ...record, visual };
      await updateRecord(next);
      setRecord(next);
      setVisualRun({ kind: 'idle' });
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError('UNKNOWN', 'Something went wrong. Try again.');
      setVisualRun(err.code === 'CANCELLED' ? { kind: 'idle' } : { kind: 'error', error: err });
    }
  };

  const back = (
    <div className="px-2 pt-2">
      <Button size="sm" variant="ghost" icon={<ArrowLeft size={15} />} onClick={onBack}>
        {backLabel}
      </Button>
    </div>
  );
  if (record === undefined) return <div>{back}<div className="mx-4 mt-4 h-40 animate-pulse rounded-card bg-cream/70" /></div>;
  if (record === null) {
    return (
      <div>
        {back}
        <p className="px-4 pt-6 text-small text-ink-2">This analysis is no longer stored.</p>
      </div>
    );
  }

  const saved = savedIds.has(record.id);
  let visualBody;
  if (visualRun.kind === 'running') {
    visualBody = (
      <DecodingLoader mode="visual" words={record.wordCount} startedAt={visualRun.startedAt} onCancel={() => visualRun.controller.abort()} />
    );
  } else if (record.visual) {
    visualBody = <VisualPanel visual={record.visual} locator={locator} onRedraw={onArticle ? drawDiagrams : undefined} />;
  } else {
    visualBody = (
      <div className="space-y-3 px-4 pt-3">
        {visualRun.kind === 'error' && <AnalysisError error={visualRun.error} onOpenSettings={() => undefined} />}
        {onArticle ? (
          <ActionTile kind="visual" primary onClick={drawDiagrams} />
        ) : (
          <div className="rounded-card border border-line bg-sheet p-4 text-small text-ink-2 shadow-card">
            Diagrams are drawn from the article itself.{' '}
            <button type="button" onClick={() => locator.openArticle?.()} className="font-semibold text-indigo-deep hover:underline">
              Open the article
            </button>{' '}
            and come back here to draw them.
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {back}
      <div className="-mt-2">
        <ArticleHeader
          title={record.title}
          siteName={record.siteName}
          author={record.author}
          publishedDate={record.publishedDate}
          url={record.url}
        />
      </div>
      <ResultTabs tab={tab} onTab={setTab} busy={{ visual: visualRun.kind === 'running' }} />
      {tab === 'analysis' ? (
        <Dashboard
          record={record}
          saved={saved}
          locator={locator}
          onToggleSave={async () => {
            if (saved) {
              await removeFromCollection('saved', record.id);
              toast.show('Removed from Saved', {
                duration: 5000,
                action: { label: 'Undo', run: () => void addToCollection('saved', record) },
              });
            } else {
              await addToCollection('saved', record);
              toast.show('Saved');
            }
          }}
        />
      ) : (
        visualBody
      )}
    </div>
  );
}
