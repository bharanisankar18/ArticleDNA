import type { ReactNode } from 'react';
import { formatDate } from '../services/format';

export function ArticleHeader({
  title,
  siteName,
  author,
  publishedDate,
  url,
  action,
}: {
  title: string;
  siteName: string | null;
  author: string | null;
  publishedDate: string | null;
  url: string;
  action?: ReactNode;
}) {
  const date = formatDate(publishedDate, 'long');
  const byline = [author, date].filter(Boolean).join(', ');

  return (
    <div className="flex items-start gap-2 px-4 pt-4">
      <div className="min-w-0 flex-1">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-block max-w-full truncate text-small font-medium text-ink-3 hover:text-indigo-deep"
          title={url}
        >
          {siteName || new URL(url).hostname}
        </a>
        <h1 className="mt-0.5 text-display font-bold tracking-[-0.018em] text-balance text-ink">{title}</h1>
        {byline && <p className="mt-1.5 truncate text-small text-ink-3">{byline}</p>}
      </div>
      {action}
    </div>
  );
}
