import type { ReactNode } from 'react';
import { CircleCheck, CircleX, ExternalLink, LocateFixed, MousePointerClick, TriangleAlert } from 'lucide-react';
import type { LocateState, Locator } from '../../hooks/useLocate';
import { cx, Spinner } from '../ui';

type Locate = { state: LocateState; run: () => void; locator: Locator };

/**
 * Items show Gemini's words only. The passage they are based on stays in the article: this button
 * scrolls the page to it and highlights it.
 */
export function LocateButton({ locate, label = 'Find in page', withText = false }: { locate: Locate; label?: string; withText?: boolean }) {
  const { state, run } = locate;
  const found = state.status === 'exact' || state.status === 'approximate';
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        run();
      }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] text-small font-semibold transition-colors duration-150',
        withText ? 'h-7 px-2' : 'h-7 w-7',
        found ? 'bg-indigo-wash text-indigo-deep' : 'text-ink-3 hover:bg-indigo-wash hover:text-indigo-deep',
      )}
    >
      {state.status === 'busy' ? <Spinner className="h-3.5 w-3.5" /> : <LocateFixed size={15} aria-hidden />}
      {withText && label}
    </button>
  );
}

/** One line saying what "Find in page" did. Renders nothing until it has been used. */
export function LocateStatus({ locate }: { locate: Locate }) {
  const { state, locator } = locate;
  let content: ReactNode = null;
  switch (state.status) {
    case 'exact':
      content = (
        <span className="text-ok">
          <CircleCheck size={13} aria-hidden /> Highlighted on the page
        </span>
      );
      break;
    case 'approximate':
      content = (
        <span className="text-warn">
          <TriangleAlert size={13} aria-hidden /> Closest match highlighted
        </span>
      );
      break;
    case 'not_found':
      content = (
        <span className="text-bad">
          <CircleX size={13} aria-hidden /> Not found on this page
        </span>
      );
      break;
    case 'unavailable':
      content =
        state.reason === 'other-page' ? (
          <span className="text-ink-3">
            In another tab.
            {locator.openArticle && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  locator.openArticle?.();
                }}
                className="inline-flex items-center gap-1 font-semibold text-indigo-deep hover:underline"
              >
                Open the article <ExternalLink size={11} aria-hidden />
              </button>
            )}
          </span>
        ) : (
          <span className="text-ink-3">
            <MousePointerClick size={13} aria-hidden /> Click the ArticleDNA icon to allow access
          </span>
        );
      break;
  }
  if (!content) return null;
  return (
    <p className="fade-in mt-1 text-meta [&>span]:inline-flex [&>span]:flex-wrap [&>span]:items-center [&>span]:gap-1" aria-live="polite">
      {content}
    </p>
  );
}
