import { useEffect, useState } from 'react';
import {
  Boxes,
  Check,
  FileText,
  Layers,
  ListChecks,
  Microscope,
  Network,
  Target,
  TriangleAlert,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ReadingMark } from './brand/Logo';
import { Button, cx } from './ui';

const W = 300;
const H = 250;
const CX = W / 2;
const CY = 122;
const ORBIT = 98;
const RING = 46;
const RING_LEN = 2 * Math.PI * RING;

interface Stage {
  label: string;
  icon: LucideIcon;
}

const ANALYSIS: Stage[] = [
  { label: 'Summarising', icon: FileText },
  { label: 'Finding the argument', icon: Target },
  { label: 'Weighing the evidence', icon: Microscope },
  { label: 'Surfacing assumptions', icon: Layers },
  { label: 'Checking limitations', icon: TriangleAlert },
  { label: 'Drawing takeaways', icon: ListChecks },
];
const VISUAL: Stage[] = [
  { label: 'Tracing the workflow', icon: Workflow },
  { label: 'Finding key concepts', icon: Boxes },
  { label: 'Linking relationships', icon: Waypoints },
  { label: 'Laying out the graph', icon: Network },
];

/**
 * Shown while Gemini works: the ArticleDNA mark reads the document at the centre while the parts
 * of the analysis are "sequenced" around it. Gemini doesn't report progress, so stages advance on
 * a schedule and the last one stays active until the answer arrives.
 */
export function DecodingLoader({
  mode,
  startedAt,
  onCancel,
}: {
  mode: 'analysis' | 'visual';
  words?: number;
  startedAt: number;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);
  const stages = mode === 'analysis' ? ANALYSIS : VISUAL;
  const perStage = mode === 'analysis' ? 5 : 6;
  const elapsed = (now - startedAt) / 1000;
  const current = Math.min(stages.length - 1, Math.floor(elapsed / perStage));
  const within = Math.min(1, (elapsed - current * perStage) / perStage);
  const progress = Math.min(0.95, (current + within * 0.85) / stages.length);

  const nodes = stages.map((stage, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / stages.length;
    return { ...stage, x: CX + ORBIT * Math.cos(angle), y: CY + ORBIT * Math.sin(angle) };
  });

  return (
    <div className="fade-in mx-4 mt-3 overflow-hidden rounded-card border border-line bg-sheet shadow-card" role="status">
      <div className="relative mx-auto" style={{ width: W, height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute inset-0" aria-hidden>
          <defs>
            <radialGradient id="loader-glow">
              <stop offset="0" stopColor="var(--color-indigo)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--color-indigo)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r={ORBIT + 26} fill="url(#loader-glow)" className="loader-breathe" />
          <circle cx={CX} cy={CY} r={ORBIT} fill="none" stroke="var(--color-line-strong)" strokeDasharray="2 6" />
          {nodes.map((n, i) => (
            <line
              key={i}
              x1={CX}
              y1={CY}
              x2={n.x}
              y2={n.y}
              strokeLinecap="round"
              strokeWidth={i === current ? 2 : 1.4}
              stroke={i <= current ? 'var(--color-indigo)' : 'var(--color-line-strong)'}
              opacity={i < current ? 0.55 : i === current ? 1 : 0.45}
              className={i === current ? 'loader-flow' : undefined}
              strokeDasharray={i === current ? '3 7' : undefined}
            />
          ))}
          {/* A comet travelling round the orbit. */}
          <g className="loader-orbit" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <circle cx={CX} cy={CY - ORBIT} r={4} fill="var(--color-indigo)" />
            <circle cx={CX - 9} cy={CY - ORBIT + 0.6} r={2.6} fill="var(--color-indigo)" opacity={0.45} />
            <circle cx={CX - 17} cy={CY - ORBIT + 2} r={1.8} fill="var(--color-indigo)" opacity={0.2} />
          </g>
          <circle cx={CX} cy={CY} r={RING} fill="var(--color-sheet)" stroke="var(--color-cream-deep)" strokeWidth={4} />
          <circle
            cx={CX}
            cy={CY}
            r={RING}
            fill="none"
            stroke="var(--color-indigo)"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={`${RING_LEN * progress} ${RING_LEN}`}
            transform={`rotate(-90 ${CX} ${CY})`}
            style={{ transition: 'stroke-dasharray 600ms var(--ease-soft)' }}
          />
        </svg>

        <div className="absolute" style={{ left: CX - 26, top: CY - 26 }}>
          <ReadingMark size={52} />
        </div>

        {nodes.map((n, i) => {
          const Icon = n.icon;
          const done = i < current;
          const active = i === current;
          return (
            <span
              key={i}
              title={n.label}
              className={cx(
                'absolute grid h-9 w-9 place-items-center rounded-full transition-all duration-500',
                done && 'bg-ink text-cream',
                active && 'loader-pulse scale-110 bg-indigo text-white',
                !done && !active && 'border border-line-strong bg-sheet text-ink-3',
              )}
              style={{ left: n.x - 18, top: n.y - 18 }}
            >
              {done ? <Check size={15} strokeWidth={2.6} aria-hidden /> : <Icon size={15} aria-hidden />}
            </span>
          );
        })}
      </div>

      <div className="border-t border-line px-4 py-3">
        <p key={current} className="fade-in text-center text-heading font-semibold text-ink" aria-live="polite">
          {stages[current].label}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="tabular text-meta text-ink-3">{Math.floor(elapsed)} s</span>
          <Button size="sm" variant="ghost" onClick={onCancel} className="-mr-2">
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
