import { useEffect, useState, type ReactNode } from 'react';
import {
  Ban,
  CircleAlert,
  FileWarning,
  FileX2,
  FolderLock,
  Hourglass,
  KeyRound,
  MousePointerClick,
  RefreshCw,
  Settings as SettingsIcon,
  Unplug,
} from 'lucide-react';
import type { BlockedCode } from '../hooks/useActivePage';
import type { ApiError } from '../services/api';
import { Button, Callout } from './ui';

// ---------------------------------------------------------------- page can't be read
const BLOCKED_COPY: Record<BlockedCode, { icon: ReactNode; title: string; body: string }> = {
  permission: {
    icon: <MousePointerClick size={22} />,
    title: 'Click the ArticleDNA icon to read this page',
    body: 'Chrome gives ArticleDNA access to a tab when you click its toolbar icon there. Or allow all sites once, and the panel will follow you between tabs.',
  },
  restricted: {
    icon: <Ban size={22} />,
    title: "Chrome doesn't let extensions read this page",
    body: 'Browser pages, the Chrome Web Store and other extensions are off limits. Open an article, paper or blog post to analyze it.',
  },
  file: {
    icon: <FolderLock size={22} />,
    title: 'Allow access to local files',
    body: 'To analyze files on your computer, open chrome://extensions, choose Details on ArticleDNA, and turn on "Allow access to file URLs".',
  },
  pdf: {
    icon: <FileX2 size={22} />,
    title: "PDFs can't be read yet",
    body: "Chrome's PDF viewer is closed to extensions. If the paper has an HTML version (arXiv, PubMed Central, most journals), open that instead.",
  },
  empty: {
    icon: <FileWarning size={22} />,
    title: 'No readable text on this page',
    body: "This page doesn't seem to contain an article. Open the article itself rather than a homepage or search results.",
  },
  'error-page': {
    icon: <CircleAlert size={22} />,
    title: 'This tab is showing an error page',
    body: 'Reload the page, then try again.',
  },
  'no-tab': {
    icon: <CircleAlert size={22} />,
    title: 'No page to read',
    body: 'Open an article in this window to analyze it.',
  },
  unknown: {
    icon: <CircleAlert size={22} />,
    title: "Couldn't read this page",
    body: 'The page may still be loading. Try again in a moment.',
  },
};

export function BlockedState({
  code,
  onRetry,
  onAllowAllSites,
}: {
  code: BlockedCode;
  onRetry: () => void;
  onAllowAllSites?: () => void;
}) {
  const copy = BLOCKED_COPY[code] ?? BLOCKED_COPY.unknown;
  return (
    <div className="fade-in px-6 pt-14 pb-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[14px] bg-cream text-ink">{copy.icon}</div>
      <h2 className="mx-auto mt-4 max-w-[30ch] text-heading font-semibold text-balance text-ink">{copy.title}</h2>
      <p className="mx-auto mt-1.5 max-w-[38ch] text-small text-ink-2">{copy.body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {code === 'permission' && onAllowAllSites && (
          <Button variant="primary" size="sm" onClick={onAllowAllSites}>
            Allow on all sites
          </Button>
        )}
        {code !== 'restricted' && code !== 'pdf' && (
          <Button size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- analysis failed
const ERROR_TITLE: Record<string, string> = {
  BACKEND_UNREACHABLE: "Can't reach the ArticleDNA server",
  GEMINI_NOT_CONFIGURED: 'The server needs an AI provider key',
  GEMINI_AUTH_FAILED: 'An API key was rejected',
  GEMINI_MODEL_UNAVAILABLE: 'The AI model is unavailable',
  RATE_LIMITED: 'The AI service is limiting requests',
  GEMINI_TIMEOUT: 'The analysis took too long',
  CLIENT_TIMEOUT: 'The analysis took too long',
  GEMINI_UNAVAILABLE: 'The AI service is temporarily unavailable',
  GEMINI_UNREACHABLE: "The server can't reach the AI service",
  CONTENT_TOO_SHORT: 'Not enough text to analyze',
  CONTENT_TOO_LONG: 'This article is too long',
  NOT_AN_ARTICLE: "This page isn't an article",
  CONTENT_BLOCKED: 'The AI declined to analyze this page',
  AI_RESPONSE_INVALID: "The AI's answer couldn't be used",
  AI_RESPONSE_INCOMPLETE: "The AI's answer was cut off",
  AI_RESPONSE_EMPTY: 'The AI returned an empty answer',
  BAD_RESPONSE: "The server's answer couldn't be read",
};

const CONFIG_ERRORS = new Set(['BACKEND_UNREACHABLE', 'GEMINI_NOT_CONFIGURED', 'GEMINI_AUTH_FAILED', 'GEMINI_MODEL_UNAVAILABLE']);

/** Seconds left until `until` (a timestamp), updating twice a second. */
export function useSecondsUntil(until: number | null) {
  const compute = () => (until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (!until) return;
    const timer = window.setInterval(() => {
      const remaining = compute();
      setLeft(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [until]);
  return left;
}

/** Errors the user can't fix by retrying the same page. */
export const PERMANENT_ERRORS = new Set(['CONTENT_TOO_SHORT', 'NOT_AN_ARTICLE', 'CONTENT_BLOCKED', 'CONTENT_TOO_LONG']);

export function AnalysisError({ error, onOpenSettings }: { error: ApiError; onOpenSettings: () => void }) {
  const icon =
    error.code === 'BACKEND_UNREACHABLE' ? (
      <Unplug size={16} />
    ) : error.code.startsWith('GEMINI_AUTH') || error.code === 'GEMINI_NOT_CONFIGURED' ? (
      <KeyRound size={16} />
    ) : error.code === 'RATE_LIMITED' || error.code.endsWith('TIMEOUT') ? (
      <Hourglass size={16} />
    ) : (
      <CircleAlert size={16} />
    );
  return (
    <Callout
      tone="bad"
      icon={icon}
      title={ERROR_TITLE[error.code] ?? 'The analysis failed'}
      actions={
        CONFIG_ERRORS.has(error.code) ? (
          <Button size="sm" variant="secondary" icon={<SettingsIcon size={14} />} onClick={onOpenSettings}>
            Server settings
          </Button>
        ) : undefined
      }
    >
      {error.message}
    </Callout>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-3 px-4 pt-5" aria-label="Reading the page" role="status">
      <div className="h-3 w-24 animate-pulse rounded bg-cream" />
      <div className="h-5 w-11/12 animate-pulse rounded bg-cream" />
      <div className="h-5 w-3/5 animate-pulse rounded bg-cream" />
      <div className="h-3 w-40 animate-pulse rounded bg-cream" />
      <div className="mt-5 h-36 animate-pulse rounded-card bg-cream/70" />
    </div>
  );
}
