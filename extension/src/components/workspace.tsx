import { Dna, KeyRound, Network, Unplug } from 'lucide-react';
import type { HealthState } from '../hooks/useBackendHealth';
import { hostOf } from '../shared/url';
import { cx, Spinner } from './ui';

export type ResultTab = 'analysis' | 'visual';

/** Switch between the written analysis and the diagrams of the same article. */
export function ResultTabs({
  tab,
  onTab,
  busy,
}: {
  tab: ResultTab;
  onTab: (tab: ResultTab) => void;
  busy: Partial<Record<ResultTab, boolean>>;
}) {
  const tabs = [
    { id: 'analysis' as const, label: 'Analysis', icon: Dna },
    { id: 'visual' as const, label: 'Visualize', icon: Network },
  ];
  return (
    <div className="px-4 pt-3.5" role="tablist" aria-label="Result view">
      <div className="grid grid-cols-2 rounded-[12px] bg-cream p-[3px]">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={cx(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] text-small font-semibold transition-colors duration-150',
              tab === id ? 'bg-sheet text-ink shadow-[0_1px_2px_rgb(9_13_26/0.12)]' : 'text-ink-2 hover:text-ink',
            )}
          >
            {busy[id] ? <Spinner className="h-3.5 w-3.5" /> : <Icon size={15} aria-hidden />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TILE_COPY = {
  analysis: { title: 'Analyze', body: 'Summary, argument, evidence, assumptions and more', icon: Dna },
  visual: { title: 'Visualize', body: 'Workflow diagram and knowledge graph', icon: Network },
} as const;

/** A large action button: the two ways into an article. */
export function ActionTile({
  kind,
  primary,
  onClick,
  disabled,
  label,
}: {
  kind: ResultTab;
  primary?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const copy = TILE_COPY[kind];
  const Icon = copy.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'group flex min-h-[112px] flex-col items-start justify-between rounded-card p-3.5 text-left transition-all duration-150 disabled:cursor-default disabled:opacity-50',
        primary
          ? 'bg-ink text-cream shadow-raised hover:bg-[#1c2235]'
          : 'border border-line-strong bg-sheet text-ink shadow-card hover:border-ink/40',
      )}
    >
      <span
        className={cx(
          'grid h-9 w-9 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-105 group-disabled:scale-100',
          primary ? 'bg-indigo text-white' : 'bg-cream text-ink',
        )}
      >
        <Icon size={18} aria-hidden />
      </span>
      <span>
        <span className="block text-heading font-semibold">{label ?? copy.title}</span>
        <span className={cx('mt-0.5 block text-meta', primary ? 'text-cream/70' : 'text-ink-3')}>{copy.body}</span>
      </span>
    </button>
  );
}

/** Only shown when something is wrong with the server; a healthy connection needs no message. */
export function ServerProblem({
  health,
  backendUrl,
  onOpenSettings,
}: {
  health: HealthState;
  backendUrl: string;
  onOpenSettings: () => void;
}) {
  if (health.status === 'offline') {
    return (
      <p className="flex items-start gap-2 text-small text-bad">
        <Unplug size={14} className="mt-[3px] shrink-0" aria-hidden />
        <span>
          Can't reach the server at {hostOf(backendUrl)}.{' '}
          <button type="button" onClick={onOpenSettings} className="font-semibold underline-offset-2 hover:underline">
            Check settings
          </button>
        </span>
      </p>
    );
  }
  if (health.status === 'online' && !health.health.gemini_configured) {
    return (
      <p className="flex items-start gap-2 text-small text-warn">
        <KeyRound size={14} className="mt-[3px] shrink-0" aria-hidden />
        <span>The server has no AI provider key. Add GEMINI_API_KEY (or a fallback such as GROQ_API_KEY) to backend/.env and restart it.</span>
      </p>
    );
  }
  return null;
}
