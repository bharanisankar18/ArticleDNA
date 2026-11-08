import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Download,
  FileText,
  Layers,
  ListChecks,
  Microscope,
  RefreshCw,
  Target,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useClipboard } from '../../hooks/useClipboard';
import { LocatorContext, type Locator } from '../../hooks/useLocate';
import { downloadText, formatDate, formatNumber, recordToMarkdown, sectionText, slugify } from '../../services/format';
import type { AnalysisRecord, ArticleAnalysis } from '../../shared/types';
import { Button, cx, IconButton } from '../ui';
import { SectionCard } from './SectionCard';
import { ArgumentBody, AssumptionsBody, EvidenceBody, LimitationsBody, SummaryBody, TakeawaysBody } from './Sections';

type SectionId = 'summary' | 'argument' | 'evidence' | 'assumptions' | 'takeaways' | 'limitations';

interface SectionDef {
  id: SectionId;
  title: string;
  short: string;
  icon: LucideIcon;
  count?: (a: ArticleAnalysis) => number;
  Body: (props: { a: ArticleAnalysis }) => JSX.Element;
  copy: (a: ArticleAnalysis) => string;
}

const SUMMARY: SectionDef = { id: 'summary', title: 'Summary', short: 'Summary', icon: FileText, Body: SummaryBody, copy: sectionText.summary };
const ARGUMENT: SectionDef = { id: 'argument', title: 'Main argument', short: 'Argument', icon: Target, Body: ArgumentBody, copy: sectionText.argument };
const EVIDENCE: SectionDef = {
  id: 'evidence',
  title: 'Evidence',
  short: 'Evidence',
  icon: Microscope,
  count: (a) => a.evidence.length,
  Body: EvidenceBody,
  copy: sectionText.evidence,
};
const ASSUMPTIONS: SectionDef = {
  id: 'assumptions',
  title: 'Assumptions',
  short: 'Assumptions',
  icon: Layers,
  count: (a) => a.assumptions.length,
  Body: AssumptionsBody,
  copy: sectionText.assumptions,
};
const TAKEAWAYS: SectionDef = { id: 'takeaways', title: 'Key takeaways', short: 'Takeaways', icon: ListChecks, Body: TakeawaysBody, copy: sectionText.takeaways };
const LIMITATIONS: SectionDef = {
  id: 'limitations',
  title: 'Limitations',
  short: 'Limitations',
  icon: TriangleAlert,
  count: (a) => a.limitations.length,
  Body: LimitationsBody,
  copy: sectionText.limitations,
};

/**
 * Research papers: the Summary holds abstract to future work, then the remaining cards.
 * Articles: the Summary holds TL;DR to further reading (takeaways included), so limitations get
 * their own card instead, when there are any.
 */
function sectionsFor(a: ArticleAnalysis): SectionDef[] {
  if (a.summary_kind === 'research') return [SUMMARY, ARGUMENT, EVIDENCE, ASSUMPTIONS, TAKEAWAYS];
  const hasLimits = a.limitations.length > 0 || a.missing_information.length > 0;
  return [SUMMARY, ARGUMENT, EVIDENCE, ASSUMPTIONS, ...(hasLimits ? [LIMITATIONS] : [])];
}
/** The section the reader is in: the last one whose top has passed under the sticky nav. */
function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = ids[ids.length - 1];
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ids]);
  return active;
}

export function Dashboard({
  record,
  saved,
  onToggleSave,
  onReanalyze,
  locator,
}: {
  record: AnalysisRecord;
  saved: boolean;
  onToggleSave: () => void;
  onReanalyze?: () => void;
  locator: Locator;
}) {
  const a = record.analysis;
  const SECTIONS = useMemo(() => sectionsFor(a), [a]);
  const copy = useClipboard();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: SectionId) => open[id] !== false;
  const allOpen = SECTIONS.every((s) => isOpen(s.id));
  const ids = useMemo(() => SECTIONS.map((s) => s.id), [SECTIONS]);
  const active = useScrollSpy(ids);
  const chipRow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = chipRow.current;
    const chip = row?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!row || !chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft + 8 || left + chip.offsetWidth > row.scrollLeft + row.clientWidth - 24) {
      row.scrollTo({ left: left - 12, behavior: 'smooth' });
    }
  }, [active]);

  const jump = (id: SectionId) => {
    setOpen((o) => ({ ...o, [id]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`section-${id}`)?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
  };

  return (
    <LocatorContext.Provider value={locator}>
      <div className="fade-in">
        <div className="flex items-center gap-1 px-4 pt-2">
          <div className="-ml-2 flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleSave}
              aria-pressed={saved}
              icon={saved ? <BookmarkCheck size={15} className="text-indigo" /> : <Bookmark size={15} />}
            >
              {saved ? 'Saved' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" icon={<Copy size={15} />} onClick={() => copy(recordToMarkdown(record), 'Analysis copied')}>
              Copy all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Download size={15} />}
              onClick={() => downloadText(`articledna-${slugify(record.title)}.md`, recordToMarkdown(record))}
            >
              Export
            </Button>
          </div>
          {onReanalyze && (
            <IconButton label="Analyze again" onClick={onReanalyze} className="-mr-1.5">
              <RefreshCw size={15} />
            </IconButton>
          )}
        </div>

        <nav aria-label="Analysis sections" className="sticky top-14 z-10 mt-2 border-y border-line bg-paper/92 backdrop-blur-sm">
          <div className="flex items-center">
            <div
              ref={chipRow}
              className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-3 py-2 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none]"
            >
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  data-section={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={cx(
                    'inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-small font-semibold transition-colors duration-150',
                    active === s.id ? 'bg-ink text-cream' : 'text-ink-2 hover:bg-cream',
                  )}
                >
                  {s.short}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(Object.fromEntries(SECTIONS.map((s) => [s.id, !allOpen])))}
              className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-[7px] text-ink-2 hover:bg-cream"
              aria-label={allOpen ? 'Collapse all sections' : 'Expand all sections'}
              title={allOpen ? 'Collapse all' : 'Expand all'}
            >
              {allOpen ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
            </button>
          </div>
        </nav>

        <div className="space-y-3 px-3 pt-3 pb-6">
          {SECTIONS.map((s) => (
            <SectionCard
              key={s.id}
              id={s.id}
              icon={s.icon}
              title={s.title}
              count={s.count?.(a)}
              open={isOpen(s.id)}
              onToggle={() => setOpen((o) => ({ ...o, [s.id]: !isOpen(s.id) }))}
              copyText={() => s.copy(a)}
            >
              <s.Body a={a} />
            </SectionCard>
          ))}
          <p className="px-1 pt-1 text-meta text-ink-3">
            Analyzed by {record.meta.model} on {formatDate(record.meta.analyzed_at, 'long')} in{' '}
            {Math.max(1, Math.round(record.meta.processing_ms / 1000))} s.
            {record.truncated && ` Long article: only the first ${formatNumber(record.meta.input_words)} words were analyzed.`}
          </p>
        </div>
      </div>
    </LocatorContext.Provider>
  );
}
