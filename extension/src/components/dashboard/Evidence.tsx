import { useLocate } from '../../hooks/useLocate';
import { EVIDENCE_TYPE_HINT, EVIDENCE_TYPE_LABEL, STRENGTH_LABEL } from '../../services/format';
import type { ArticleAnalysis, EvidenceStrength, EvidenceType } from '../../shared/types';
import { LocateButton, LocateStatus } from './Locate';

export const EVIDENCE_COLOR: Record<EvidenceType, string> = {
  empirical: 'var(--color-ev-empirical)',
  example: 'var(--color-ev-example)',
  expert_opinion: 'var(--color-ev-expert)',
  author_opinion: 'var(--color-ev-author)',
  unsupported: 'var(--color-ev-unsupported)',
};

const TYPE_ORDER: EvidenceType[] = ['empirical', 'example', 'expert_opinion', 'author_opinion', 'unsupported'];

type Evidence = ArticleAnalysis['evidence'][number];

/**
 * The article's evidence profile: one segment per claim, coloured by the kind of support behind it.
 * Segments are buttons that jump to their claim.
 */
export function EvidenceFingerprint({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return null;
  const counts = TYPE_ORDER.map((type) => ({ type, n: evidence.filter((e) => e.evidence_type === type).length })).filter(
    (c) => c.n > 0,
  );
  return (
    <div className="rounded-[10px] bg-cream/70 px-3 py-2.5">
      <div className="flex h-2.5 gap-[3px]" role="list" aria-label="Evidence profile">
        {evidence.map((e, i) => (
          <button
            key={i}
            type="button"
            role="listitem"
            title={`${EVIDENCE_TYPE_LABEL[e.evidence_type]}: ${e.claim}`}
            aria-label={`Claim ${i + 1}, ${EVIDENCE_TYPE_LABEL[e.evidence_type]}`}
            onClick={() => document.getElementById(`evidence-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="h-full min-w-2 flex-1 rounded-[3px] transition-transform duration-150 hover:scale-y-150"
            style={{ background: EVIDENCE_COLOR[e.evidence_type], opacity: e.strength === 'weak' ? 0.55 : 1 }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-meta text-ink-2">
        {counts.map(({ type, n }) => (
          <li key={type} className="inline-flex items-center gap-1.5" title={EVIDENCE_TYPE_HINT[type]}>
            <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: EVIDENCE_COLOR[type] }} />
            {EVIDENCE_TYPE_LABEL[type]}
            <span className="tabular text-ink-3">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StrengthMeter({ strength }: { strength: EvidenceStrength }) {
  const filled = { weak: 1, moderate: 2, strong: 3 }[strength];
  return (
    <span className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-3" title={STRENGTH_LABEL[strength]}>
      <span aria-hidden className="inline-flex items-end gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-[1px]"
            style={{ height: 5 + i * 2.5, background: i < filled ? 'var(--color-ink-2)' : 'var(--color-line-strong)' }}
          />
        ))}
      </span>
      {STRENGTH_LABEL[strength]}
    </span>
  );
}

export function EvidenceItem({ item, index }: { item: Evidence; index: number }) {
  const locate = useLocate(item.excerpt);
  const clickable = Boolean(item.excerpt);
  return (
    <li
      id={`evidence-${index}`}
      className={
        'scroll-mt-[120px] -mx-2 rounded-[10px] px-2 py-3 transition-colors duration-150 ' +
        (clickable ? 'cursor-pointer hover:bg-cream/55' : '')
      }
      onClick={(e) => {
        // Clicking the claim jumps to its passage; ignore clicks on nested controls and text selection.
        if (!clickable || (e.target as HTMLElement).closest('button, a') || window.getSelection()?.toString()) return;
        locate.run();
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-meta font-semibold text-ink-2" title={EVIDENCE_TYPE_HINT[item.evidence_type]}>
          <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: EVIDENCE_COLOR[item.evidence_type] }} />
          {EVIDENCE_TYPE_LABEL[item.evidence_type]}
        </span>
        <StrengthMeter strength={item.strength} />
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">{item.claim}</p>
          {item.explanation && <p className="mt-1 text-small text-ink-2">{item.explanation}</p>}
          <LocateStatus locate={locate} />
        </div>
        {clickable && <LocateButton locate={locate} />}
      </div>
    </li>
  );
}
