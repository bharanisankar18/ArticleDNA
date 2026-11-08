import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Copy, type LucideIcon } from 'lucide-react';
import { useClipboard } from '../../hooks/useClipboard';
import { cx, IconButton } from '../ui';

export function SectionCard({
  id,
  icon: Icon,
  title,
  count,
  open,
  onToggle,
  copyText,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  copyText: () => string;
  children: ReactNode;
}) {
  const copy = useClipboard();
  const [copied, setCopied] = useState(false);
  const bodyId = `section-${id}-body`;

  return (
    <section id={`section-${id}`} className="scroll-mt-[112px] rounded-card border border-line bg-sheet shadow-card">
      <div className="flex items-center gap-1 py-2 pr-2 pl-3">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex w-full items-center gap-2.5 rounded-[8px] py-1 text-left"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-cream text-ink">
              <Icon size={16} strokeWidth={2.1} aria-hidden />
            </span>
            <span className="truncate text-heading font-semibold tracking-[-0.005em] text-ink">{title}</span>
            {count !== undefined && <span className="tabular text-small font-medium text-ink-3">{count}</span>}
          </button>
        </h2>
        <IconButton
          label={copied ? 'Copied' : `Copy ${title.toLowerCase()}`}
          onClick={async () => {
            if (await copy(copyText(), `${title} copied`)) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }
          }}
        >
          {copied ? <Check size={15} className="text-ok" /> : <Copy size={15} />}
        </IconButton>
        <IconButton label={open ? `Collapse ${title.toLowerCase()}` : `Expand ${title.toLowerCase()}`} onClick={onToggle}>
          <ChevronDown size={17} className={cx('transition-transform duration-200', open && 'rotate-180')} />
        </IconButton>
      </div>
      <div className="collapsible" data-open={open} id={bodyId} inert={!open}>
        <div>
          <div className="px-3.5 pt-0.5 pb-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** A short sentence-case heading inside a card. */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-small font-semibold text-ink-3">{children}</h3>;
}
