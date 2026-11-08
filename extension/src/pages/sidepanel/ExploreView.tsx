import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Lock, RefreshCw } from 'lucide-react';
import { ArticleHeader } from '../../components/ArticleHeader';
import { Dashboard } from '../../components/dashboard/Dashboard';
import { DecodingLoader } from '../../components/Loader';
import { AnalysisError, BlockedState, PageSkeleton, PERMANENT_ERRORS, useSecondsUntil } from '../../components/states';
import { useToast } from '../../components/Toast';
import { Button, Callout, IconButton } from '../../components/ui';
import { VisualPanel } from '../../components/visual/VisualPanel';
import { ActionTile, ResultTabs, ServerProblem, type ResultTab } from '../../components/workspace';
import type { PageState } from '../../hooks/useActivePage';
import type { HealthState } from '../../hooks/useBackendHealth';
import type { Collections } from '../../hooks/useLibrary';
import type { Locator } from '../../hooks/useLocate';
import { analyzeArticle, ApiError, prepareContent, visualizeArticle } from '../../services/api';
import { formatNumber, formatRelative, formatWait } from '../../services/format';
import { clearInTab, locateInTab, requestAllSitesAccess } from '../../services/pageBridge';
import { addToCollection, getRecord, removeFromCollection, updateRecord } from '../../services/storage';
import { DEFAULT_LIMITS } from '../../shared/constants';
import type { AnalysisRecord, ExtractedArticle, Settings, Visualization } from '../../shared/types';
import { urlKey } from '../../shared/url';

type Run<T> =
  | { kind: 'idle' }
  | { kind: 'running'; startedAt: number; controller: AbortController }
  | { kind: 'done'; value: T }
  | { kind: 'error'; error: ApiError; retryAt: number | null };

interface Session {
  analysis: Run<AnalysisRecord>;
  visual: Run<Visualization>;
  tab: ResultTab;
}

const EMPTY: Session = { analysis: { kind: 'idle' }, visual: { kind: 'idle' }, tab: 'analysis' };
const SERVER_ERRORS = new Set(['BACKEND_UNREACHABLE', 'GEMINI_NOT_CONFIGURED', 'GEMINI_AUTH_FAILED', 'GEMINI_MODEL_UNAVAILABLE']);

function toApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError('UNKNOWN', 'Something went wrong. Try again.');
}

export function ExploreView({
  page,
  refresh,
  settings,
  health,
  recheckHealth,
  collections,
  onOpenSettings,
}: {
  page: PageState;
  refresh: () => void;
  settings: Settings;
  health: HealthState;
  recheckHealth: () => Promise<boolean>;
  collections: Collections;
  onOpenSettings: () => void;
}) {
  const toast = useToast();
  // Results are kept per article for this session, so switching tabs and back keeps them.
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const key = page.kind === 'ready' ? urlKey(page.article.url) : null;
  const session = (key && sessions[key]) || EMPTY;
  const limits = health.status === 'online' ? health.health.limits : DEFAULT_LIMITS;
  const savedIds = useMemo(() => new Set(collections.saved.map((e) => e.id)), [collections.saved]);
  const previous = key
    ? (collections.saved.find((e) => e.urlKey === key) ?? collections.history.find((e) => e.urlKey === key) ?? null)
    : null;

  const update = useCallback((k: string, patch: (s: Session) => Partial<Session>) => {
    setSessions((all) => {
      const current = all[k] ?? EMPTY;
      return { ...all, [k]: { ...current, ...patch(current) } };
    });
  }, []);

  const failed = useCallback(
    (k: string, which: 'analysis' | 'visual', error: unknown) => {
      const err = toApiError(error);
      if (err.code === 'CANCELLED') return update(k, () => ({ [which]: { kind: 'idle' } }));
      if (err.code === 'BACKEND_UNREACHABLE') recheckHealth();
      const retryAt = err.retryAfterSeconds ? Date.now() + err.retryAfterSeconds * 1000 : null;
      update(k, () => ({ [which]: { kind: 'error', error: err, retryAt } }));
    },
    [update, recheckHealth],
  );

  const analyze = useCallback(
    async (article: ExtractedArticle) => {
      const k = urlKey(article.url);
      const controller = new AbortController();
      update(k, () => ({ analysis: { kind: 'running', startedAt: Date.now(), controller }, tab: 'analysis' }));
      const prepared = prepareContent(article.content, limits.max_content_chars);
      try {
        const response = await analyzeArticle(settings.backendUrl, article, prepared.text, controller.signal);
        const visual = sessionsRef.current[k]?.visual;
        const record: AnalysisRecord = {
          id: crypto.randomUUID(),
          url: article.url,
          urlKey: k,
          title: article.title,
          siteName: article.siteName,
          author: article.author,
          publishedDate: article.publishedDate,
          wordCount: article.wordCount,
          truncated: prepared.truncated,
          analysis: response.analysis,
          meta: response.meta,
          visual: visual?.kind === 'done' ? visual.value : null,
        };
        if (settings.keepHistory) {
          addToCollection('history', record).catch(() => toast.show("Couldn't add the analysis to history", { tone: 'bad' }));
        }
        update(k, () => ({ analysis: { kind: 'done', value: record } }));
      } catch (error) {
        failed(k, 'analysis', error);
      }
    },
    [limits.max_content_chars, settings.backendUrl, settings.keepHistory, update, failed, toast],
  );

  const visualize = useCallback(
    async (article: ExtractedArticle) => {
      const k = urlKey(article.url);
      const controller = new AbortController();
      update(k, () => ({ visual: { kind: 'running', startedAt: Date.now(), controller }, tab: 'visual' }));
      const prepared = prepareContent(article.content, limits.max_content_chars);
      try {
        const { visual } = await visualizeArticle(settings.backendUrl, article, prepared.text, controller.signal);
        const analysis = sessionsRef.current[k]?.analysis;
        if (analysis?.kind === 'done') {
          // Keep the diagrams with the stored analysis so History and Saved show them too.
          const record = { ...analysis.value, visual };
          updateRecord(record).catch(() => undefined);
          update(k, () => ({ visual: { kind: 'done', value: visual }, analysis: { kind: 'done', value: record } }));
        } else {
          update(k, () => ({ visual: { kind: 'done', value: visual } }));
        }
      } catch (error) {
        failed(k, 'visual', error);
      }
    },
    [limits.max_content_chars, settings.backendUrl, update, failed],
  );

  const toggleSave = useCallback(
    async (record: AnalysisRecord) => {
      if (savedIds.has(record.id)) {
        await removeFromCollection('saved', record.id);
        toast.show('Removed from Saved', {
          duration: 5000,
          action: { label: 'Undo', run: () => void addToCollection('saved', record) },
        });
      } else {
        await addToCollection('saved', record);
        toast.show('Saved');
      }
    },
    [savedIds, toast],
  );

  const openPrevious = useCallback(async () => {
    if (!previous || !key) return;
    const record = await getRecord(previous.id);
    if (!record) return toast.show("That analysis couldn't be loaded", { tone: 'bad' });
    update(key, () => ({
      analysis: { kind: 'done', value: record },
      visual: record.visual ? { kind: 'done', value: record.visual } : { kind: 'idle' },
      tab: 'analysis',
    }));
  }, [previous, key, update, toast]);

  const locator = useMemo<Locator>(
    () =>
      page.kind === 'ready'
        ? { availability: 'ready', locate: (quote) => locateInTab(page.tabId, quote) }
        : { availability: 'no-access', locate: async () => ({ status: 'not_found' }) },
    [page],
  );

  // Clear page highlights when the panel moves on from an article.
  const tabId = page.kind === 'ready' ? page.tabId : null;
  useEffect(() => {
    return () => {
      if (tabId !== null) clearInTab(tabId);
    };
  }, [tabId, key]);

  const retryAt = Math.max(
    session.analysis.kind === 'error' ? (session.analysis.retryAt ?? 0) : 0,
    session.visual.kind === 'error' ? (session.visual.retryAt ?? 0) : 0,
  );
  const wait = useSecondsUntil(retryAt || null);

  if (page.kind === 'loading') return <PageSkeleton />;
  if (page.kind === 'blocked') {
    return (
      <BlockedState
        code={page.code}
        onRetry={refresh}
        onAllowAllSites={async () => {
          if (await requestAllSitesAccess()) refresh();
        }}
      />
    );
  }

  const { article } = page;
  const tooShort = article.wordCount < limits.min_content_words;
  // Short waits block the buttons; a long one (a daily quota) shouldn't, since adding another
  // provider key on the server fixes it right away.
  const blocked = tooShort || (wait > 0 && wait <= 120);
  const header = (
    <ArticleHeader
      title={article.title}
      siteName={article.siteName}
      author={article.author}
      publishedDate={article.publishedDate}
      url={article.url}
      action={
        <IconButton label="Read the page again" onClick={refresh} className="-mr-1.5">
          <RefreshCw size={15} />
        </IconButton>
      }
    />
  );
  const errors = (['analysis', 'visual'] as const)
    .map((which) => session[which])
    .filter((run): run is Extract<Run<unknown>, { kind: 'error' }> => run.kind === 'error');
  const notes = (
    <>
      {tooShort && (
        <p className="text-small text-bad">
          Only {formatNumber(article.wordCount)} words were found on this page. At least {limits.min_content_words} are needed.
        </p>
      )}
      {wait > 0 && (
        <p className="text-small text-warn">
          You can try again in {wait > 120 ? 'about ' : ''}{formatWait(wait)}.
          {wait > 120 && ' Or add a fallback provider key (such as GROQ_API_KEY) to backend/.env and restart the server.'}
        </p>
      )}
    </>
  );

  const started = (['running', 'done'] as const).some((k) => session.analysis.kind === k || session.visual.kind === k);

  // ------------------------------------------------------------ before any result
  if (!started) {
    const showServer = !errors.some((e) => SERVER_ERRORS.has(e.error.code));
    return (
      <div className="pb-6">
        {header}
        <div className="space-y-3 px-4 pt-4">
          {previous && (
            <Callout
              tone="indigo"
              icon={<BookOpen size={16} />}
              title="You've analyzed this article before"
              actions={
                <Button size="sm" variant="primary" onClick={openPrevious}>
                  View analysis
                </Button>
              }
            >
              {formatRelative(previous.analyzedAt)}.
            </Callout>
          )}
          {errors.map((e, i) => (
            <AnalysisError key={i} error={e.error} onOpenSettings={onOpenSettings} />
          ))}
          {showServer && <ServerProblem health={health} backendUrl={settings.backendUrl} onOpenSettings={onOpenSettings} />}
          <div className="grid grid-cols-2 gap-2.5">
            <ActionTile kind="analysis" primary onClick={() => analyze(article)} disabled={blocked} />
            <ActionTile kind="visual" onClick={() => visualize(article)} disabled={blocked} />
          </div>
          {notes}
          <p className="flex gap-2 pt-1 text-meta text-ink-3">
            <Lock size={12} className="mt-[2px] shrink-0" aria-hidden />
            <span>The article's text is sent to your ArticleDNA server and Google Gemini only when you choose an action.</span>
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ results
  const tabBody = (which: ResultTab) => {
    const run = session[which];
    if (run.kind === 'running') {
      return <DecodingLoader mode={which} words={article.wordCount} startedAt={run.startedAt} onCancel={() => run.controller.abort()} />;
    }
    if (run.kind === 'done') {
      return which === 'analysis' ? (
        <Dashboard
          record={run.value as AnalysisRecord}
          saved={savedIds.has((run.value as AnalysisRecord).id)}
          onToggleSave={() => toggleSave(run.value as AnalysisRecord)}
          onReanalyze={() => analyze(article)}
          locator={locator}
        />
      ) : (
        <VisualPanel visual={run.value as Visualization} locator={locator} onRedraw={() => visualize(article)} />
      );
    }
    const label =
      run.kind === 'error' && !PERMANENT_ERRORS.has(run.error.code) ? 'Try again' : which === 'analysis' ? 'Analyze' : 'Visualize';
    return (
      <div className="space-y-3 px-4 pt-3">
        {run.kind === 'error' && <AnalysisError error={run.error} onOpenSettings={onOpenSettings} />}
        <ActionTile
          kind={which}
          primary
          label={label}
          onClick={() => (which === 'analysis' ? analyze(article) : visualize(article))}
          disabled={blocked}
        />
        {notes}
      </div>
    );
  };

  return (
    <div>
      {header}
      <ResultTabs
        tab={session.tab}
        onTab={(tab) => key && update(key, () => ({ tab }))}
        busy={{ analysis: session.analysis.kind === 'running', visual: session.visual.kind === 'running' }}
      />
      {tabBody(session.tab)}
    </div>
  );
}
