import type { ReactNode } from 'react';
import {
  BookMarked,
  ChartColumn,
  FileText,
  FlaskConical,
  Lightbulb,
  ListChecks,
  Puzzle,
  Quote as QuoteIcon,
  Search,
  Shapes,
  Sparkles,
  Telescope,
  TriangleAlert,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useLocate } from '../../hooks/useLocate';
import { BASIS_LABEL, LIMITATION_LABEL } from '../../services/format';
import type { ArticleAnalysis, ArticleSummary, KeyPoint } from '../../shared/types';
import { Badge } from '../ui';
import { EvidenceFingerprint, EvidenceItem } from './Evidence';
import { LocateButton, LocateStatus } from './Locate';
import { SubHeading } from './SectionCard';

type A = ArticleAnalysis;

function Empty({ children }: { children: string }) {
  return <p className="text-small text-ink-3">{children}</p>;
}

/** The logo's document line, used as the list marker for points. */
function Marker() {
  return <span aria-hidden className="mt-[9px] h-[4px] w-3.5 shrink-0 rounded-[2px] bg-indigo" />;
}

/** A sub-part of the Summary card, with its own small heading. */
function Part({ icon: Icon, title, aside, children }: { icon: LucideIcon; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line py-4 first:border-t-0 first:pt-1 last:pb-0">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-indigo-wash text-indigo-deep">
          <Icon size={13} strokeWidth={2.2} aria-hidden />
        </span>
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {aside && <span className="ml-auto">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Anchored({ excerpt, children }: { excerpt: string; children: ReactNode }) {
  const locate = useLocate(excerpt);
  return (
    <li className="flex items-start gap-3">
      <Marker />
      <div className="min-w-0 flex-1">
        {children}
        <LocateStatus locate={locate} />
      </div>
      {excerpt && <LocateButton locate={locate} />}
    </li>
  );
}

function PointList({ points, empty }: { points: KeyPoint[]; empty: string }) {
  if (!points.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-3">
      {points.map((p, i) => (
        <Anchored key={i} excerpt={p.excerpt}>
          <p className="text-body text-ink">{p.point}</p>
        </Anchored>
      ))}
    </ul>
  );
}

function TextList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-body text-ink">
          <Marker />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- limitations & future work
function LimitationItem({ item }: { item: A['limitations'][number] }) {
  const locate = useLocate(item.excerpt);
  return (
    <li className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Badge tone="warn">{LIMITATION_LABEL[item.category]}</Badge>
        <p className="mt-1.5 text-body font-semibold text-ink">{item.limitation}</p>
        {item.explanation && <p className="mt-0.5 text-small text-ink-2">{item.explanation}</p>}
        <LocateStatus locate={locate} />
      </div>
      {item.excerpt && <LocateButton locate={locate} />}
    </li>
  );
}

function LimitationsList({ a }: { a: A }) {
  return (
    <div className="space-y-3">
      {a.limitations.length ? (
        <ul className="space-y-3.5">
          {a.limitations.map((item, i) => (
            <LimitationItem key={i} item={item} />
          ))}
        </ul>
      ) : (
        <Empty>No limitations could be justified from the text itself.</Empty>
      )}
      {a.missing_information.length > 0 && (
        <div className="rounded-[10px] bg-cream/70 px-3 py-2.5">
          <SubHeading>Not covered by the article</SubHeading>
          <ul className="mt-1.5 space-y-1">
            {a.missing_information.map((m, i) => (
              <li key={i} className="flex gap-2 text-small text-ink-2">
                <span aria-hidden className="mt-[9px] h-[2px] w-2.5 shrink-0 rounded-full bg-ink-3" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DirectionsList({ a }: { a: A }) {
  const groups = [
    { title: 'From the author', items: a.future_directions.filter((d) => d.source === 'author') },
    { title: 'Suggested by Gemini', items: a.future_directions.filter((d) => d.source === 'ai_suggested') },
  ].filter((g) => g.items.length);
  if (!groups.length) return <Empty>No future work identified.</Empty>;
  return (
    <div className="space-y-3.5">
      {groups.map((g) => (
        <div key={g.title}>
          <SubHeading>{g.title}</SubHeading>
          <ul className="mt-2 space-y-3">
            {g.items.map((d, i) => (
              <Anchored key={i} excerpt={d.excerpt}>
                <p className="text-body font-semibold text-ink">{d.direction}</p>
                {d.rationale && <p className="mt-0.5 text-small text-ink-2">{d.rationale}</p>}
              </Anchored>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- article summary parts
function ConceptItem({ c }: { c: ArticleSummary['core_concepts'][number] }) {
  return (
    <Anchored excerpt={c.excerpt}>
      <p className="text-body text-ink">
        <span className="font-semibold">{c.term}</span>
        <span className="text-ink-2"> {c.explanation}</span>
      </p>
    </Anchored>
  );
}

function StatTile({ s }: { s: ArticleSummary['statistics'][number] }) {
  const locate = useLocate(s.excerpt || s.figure);
  return (
    <li className="relative rounded-[11px] border border-line bg-paper/70 px-3 pt-2.5 pb-3">
      <p className="tabular pr-7 text-[19px] leading-tight font-bold tracking-[-0.01em] text-indigo-deep">{s.figure}</p>
      <p className="mt-1 text-meta text-ink-2">{s.context}</p>
      <LocateStatus locate={locate} />
      <span className="absolute top-1.5 right-1.5">
        <LocateButton locate={locate} />
      </span>
    </li>
  );
}

function QuoteItem({ q }: { q: ArticleSummary['key_quotes'][number] }) {
  const locate = useLocate(q.quote);
  return (
    <li className="flex items-start gap-2">
      <figure className="min-w-0 flex-1 border-l-[2.5px] border-indigo pl-3">
        <blockquote className="font-serif text-quote text-ink">{q.quote}</blockquote>
        <figcaption className="mt-1 text-meta font-semibold text-ink-3">{q.speaker}</figcaption>
        <LocateStatus locate={locate} />
      </figure>
      <LocateButton locate={locate} />
    </li>
  );
}

function ArticleParts({ a, s }: { a: A; s: ArticleSummary }) {
  return (
    <>
      <Part icon={Zap} title="TL;DR">
        <p className="text-lead font-medium tracking-[-0.005em] text-ink">{s.tldr}</p>
      </Part>
      {a.key_takeaways.length > 0 && (
        <Part icon={ListChecks} title="Key takeaways">
          <TextList items={a.key_takeaways} />
        </Part>
      )}
      {s.core_concepts.length > 0 && (
        <Part icon={Shapes} title="Core concepts">
          <ul className="space-y-3">
            {s.core_concepts.map((c, i) => (
              <ConceptItem key={i} c={c} />
            ))}
          </ul>
        </Part>
      )}
      {s.important_facts.length > 0 && (
        <Part icon={Lightbulb} title="Important facts">
          <PointList points={s.important_facts} empty="" />
        </Part>
      )}
      {s.statistics.length > 0 && (
        <Part icon={ChartColumn} title="Statistics & data">
          <ul className="grid grid-cols-2 gap-2">
            {s.statistics.map((x, i) => (
              <StatTile key={i} s={x} />
            ))}
          </ul>
        </Part>
      )}
      {s.key_quotes.length > 0 && (
        <Part icon={QuoteIcon} title="Key quotes">
          <ul className="space-y-3.5">
            {s.key_quotes.map((q, i) => (
              <QuoteItem key={i} q={q} />
            ))}
          </ul>
        </Part>
      )}
      {s.references.length > 0 && (
        <Part icon={BookMarked} title="References & sources">
          <ul className="space-y-3">
            {s.references.map((r, i) => (
              <Anchored key={i} excerpt={r.excerpt}>
                <p className="text-body font-semibold text-ink">{r.source}</p>
                {r.cited_for && <p className="mt-0.5 text-small text-ink-2">{r.cited_for}</p>}
              </Anchored>
            ))}
          </ul>
        </Part>
      )}
      {s.further_reading.length > 0 && (
        <Part icon={Sparkles} title="Further reading" aside={<Badge tone="outline">Suggested by Gemini</Badge>}>
          <ul className="space-y-3">
            {s.further_reading.map((f, i) => (
              <li key={i} className="flex items-start gap-3">
                <Marker />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-ink">{f.topic}</p>
                  {f.reason && <p className="mt-0.5 text-small text-ink-2">{f.reason}</p>}
                </div>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(f.topic)}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Search for ${f.topic}`}
                  aria-label={`Search the web for ${f.topic}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-ink-3 hover:bg-indigo-wash hover:text-indigo-deep"
                >
                  <Search size={15} />
                </a>
              </li>
            ))}
          </ul>
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------- summary card
export function SummaryBody({ a }: { a: A }) {
  const r = a.research_summary;
  if (a.summary_kind === 'research' && r) {
    return (
      <div>
        <Part icon={FileText} title="Abstract">
          <PointList points={r.abstract} empty="No abstract could be drawn from the text." />
        </Part>
        <Part icon={FlaskConical} title="Methodology">
          <PointList points={r.methodology} empty="The paper doesn't describe how the work was done." />
        </Part>
        <Part icon={Lightbulb} title="Key findings">
          <PointList points={r.key_findings} empty="No findings identified." />
        </Part>
        <Part icon={Puzzle} title="Research gap">
          <PointList points={r.research_gap} empty="The paper doesn't state the gap it addresses." />
        </Part>
        <Part icon={TriangleAlert} title="Limitations">
          <LimitationsList a={a} />
        </Part>
        <Part icon={Telescope} title="Future work">
          <DirectionsList a={a} />
        </Part>
      </div>
    );
  }
  return <div>{a.article_summary && <ArticleParts a={a} s={a.article_summary} />}</div>;
}

// ---------------------------------------------------------------- separate cards
export function ArgumentBody({ a }: { a: A }) {
  const m = a.main_argument;
  const locate = useLocate(m.supporting_excerpt);
  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lead font-semibold tracking-[-0.01em] text-ink">{m.thesis}</p>
          <LocateStatus locate={locate} />
        </div>
        {m.supporting_excerpt && <LocateButton locate={locate} />}
      </div>
      <div className="mt-3.5 space-y-3 border-t border-line pt-3.5">
        <div>
          <SubHeading>What the author wants you to understand</SubHeading>
          <p className="mt-0.5 text-body text-ink-2">{m.author_intent}</p>
        </div>
        <div>
          <SubHeading>How it differs from other views</SubHeading>
          <p className="mt-0.5 text-body text-ink-2">{m.contrast_with_other_views}</p>
        </div>
      </div>
    </div>
  );
}

export function EvidenceBody({ a }: { a: A }) {
  if (!a.evidence.length) return <Empty>No claims with supporting evidence identified.</Empty>;
  return (
    <div>
      <EvidenceFingerprint evidence={a.evidence} />
      <ul className="mt-1 divide-y divide-line">
        {a.evidence.map((item, i) => (
          <EvidenceItem key={i} item={item} index={i} />
        ))}
      </ul>
    </div>
  );
}

function AssumptionItem({ item }: { item: A['assumptions'][number] }) {
  const locate = useLocate(item.excerpt);
  return (
    <li className="flex items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <Badge tone={item.basis === 'explicit' ? 'indigo' : 'outline'}>{BASIS_LABEL[item.basis]}</Badge>
        <p className="mt-1.5 text-body font-semibold text-ink">{item.assumption}</p>
        {item.explanation && <p className="mt-1 text-small text-ink-2">{item.explanation}</p>}
        <LocateStatus locate={locate} />
      </div>
      {item.excerpt && <LocateButton locate={locate} />}
    </li>
  );
}

export function AssumptionsBody({ a }: { a: A }) {
  if (!a.assumptions.length) return <Empty>No assumptions identified.</Empty>;
  return (
    <ul className="-mt-3 divide-y divide-line">
      {a.assumptions.map((item, i) => (
        <AssumptionItem key={i} item={item} />
      ))}
    </ul>
  );
}

export function TakeawaysBody({ a }: { a: A }) {
  if (!a.key_takeaways.length) return <Empty>No takeaways.</Empty>;
  return <TextList items={a.key_takeaways} />;
}

export function LimitationsBody({ a }: { a: A }) {
  return <LimitationsList a={a} />;
}
