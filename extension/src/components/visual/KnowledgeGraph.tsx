import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { ArrowRight, Maximize2, Minimize2, X } from 'lucide-react';
import { useLocate } from '../../hooks/useLocate';
import { GROUP_LABEL } from '../../services/format';
import type { NodeGroup, Visualization } from '../../shared/types';
import { LocateButton, LocateStatus } from '../dashboard/Locate';
import { cx, IconButton } from '../ui';
import { GROUP_COLOR } from './palette';

type GraphNode = Visualization['nodes'][number];
type Edge = Visualization['edges'][number];

const PILL_H = 26;
const FONT = 11.5;
const CHAR_W = 6.7; // average glyph width of the 11.5px semibold UI font
const PILL_PAD = 32; // dot + side padding
const MAX_PILL = 184;
const pillWidth = (label: string) => Math.min(MAX_PILL, Math.round(label.length * CHAR_W + PILL_PAD));
const fitLabel = (label: string, width: number) => {
  const max = Math.floor((width - PILL_PAD) / CHAR_W);
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
};

interface Placed {
  node: GraphNode;
  x: number;
  y: number;
  w: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  w: number;
}

/**
 * Force-directed layout, constrained to the available width so labels stay at full size in a
 * narrow side panel; the graph grows downwards instead of shrinking.
 */
/** Push apart pills whose rectangles overlap (circle collision would space wide pills far too much vertically). */
function separatePills(nodes: SimNode[], padX = 16, padY = 30) {
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const overlapX = (a.w + b.w) / 2 + padX - Math.abs(dx);
        const overlapY = PILL_H + padY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        // Separate along the axis that needs the smaller move.
        if (overlapY < overlapX) {
          const shift = (overlapY / 2) * (dy < 0 ? -1 : 1);
          a.y = (a.y ?? 0) - shift;
          b.y = (b.y ?? 0) + shift;
        } else {
          const shift = (overlapX / 2) * (dx < 0 ? -1 : 1);
          a.x = (a.x ?? 0) - shift;
          b.x = (b.x ?? 0) + shift;
        }
      }
    }
  }
}

function layout(nodes: GraphNode[], edges: Edge[], width: number): { placed: Placed[]; height: number } {
  const half = width / 2 - 10;
  const sim: SimNode[] = nodes.map((n) => ({ id: n.id, w: pillWidth(n.label) }));
  const links = edges.map((e) => ({ source: e.source, target: e.target }));
  const simulation = forceSimulation(sim)
    .force('link', forceLink<SimNode, { source: string; target: string }>(links).id((d) => d.id).distance(95).strength(0.45))
    .force('charge', forceManyBody().strength(-420).distanceMax(400))
    .force('collide', forceCollide<SimNode>(PILL_H))
    .force('x', forceX(0).strength(0.015))
    .force('y', forceY(0).strength(0.05))
    .stop();
  for (let i = 0; i < 400; i++) {
    simulation.tick();
    separatePills(sim);
    for (const n of sim) {
      const limit = Math.max(0, half - n.w / 2);
      n.x = Math.max(-limit, Math.min(limit, n.x ?? 0));
    }
  }
  const ys = sim.map((n) => n.y ?? 0);
  const minY = Math.min(...ys) - PILL_H;
  const maxY = Math.max(...ys) + PILL_H;
  const placed = sim.map((n, i) => ({ node: nodes[i], x: (n.x ?? 0) + width / 2, y: (n.y ?? 0) - minY, w: n.w }));
  return { placed, height: Math.max(260, maxY - minY) };
}

/** Width of an element that may mount later (callback ref), rounded so tiny resizes don't re-run the layout. */
function useWidth() {
  const [width, setWidth] = useState(360);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    observer.current = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width / 20) * 20));
    });
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, width };
}

function NodeDetail({
  node,
  edges,
  byId,
  onSelect,
  onClose,
}: {
  node: GraphNode;
  edges: Edge[];
  byId: Map<string, GraphNode>;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const locate = useLocate(node.excerpt);
  const links = edges.filter((e) => e.source === node.id || e.target === node.id);
  return (
    <div className="fade-in mt-3 rounded-[12px] border border-line bg-sheet p-3 shadow-card">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-meta font-semibold" style={{ color: GROUP_COLOR[node.group] }}>
            {GROUP_LABEL[node.group]}
          </p>
          <p className="text-heading font-semibold text-ink">{node.label}</p>
          <p className="mt-0.5 text-small text-ink-2">{node.description}</p>
          <LocateStatus locate={locate} />
        </div>
        {node.excerpt && <LocateButton locate={locate} />}
        <IconButton label="Close details" onClick={onClose} className="-mt-1 -mr-1 h-7 w-7">
          <X size={15} />
        </IconButton>
      </div>
      {links.length > 0 && (
        <ul className="mt-2.5 space-y-1 border-t border-line pt-2.5">
          {links.map((e, i) => {
            const outgoing = e.source === node.id;
            const other = byId.get(outgoing ? e.target : e.source);
            if (!other) return null;
            return (
              <li key={i} className="flex flex-wrap items-center gap-x-1.5 text-small text-ink-2">
                {outgoing ? (
                  <>
                    <span className="text-ink-3">{e.relation}</span>
                    <ArrowRight size={12} className="text-ink-3" aria-hidden />
                  </>
                ) : (
                  <ArrowRight size={12} className="rotate-180 text-ink-3" aria-hidden />
                )}
                <button type="button" onClick={() => onSelect(other.id)} className="font-semibold text-indigo-deep hover:underline">
                  {other.label}
                </button>
                {!outgoing && <span className="text-ink-3">{e.relation}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GraphCanvas({
  visual,
  width,
  selected,
  onSelect,
}: {
  visual: Visualization;
  width: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { placed, height } = useMemo(() => layout(visual.nodes, visual.edges, width), [visual, width]);
  const pos = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const neighbours = useMemo(() => {
    if (!selected) return null;
    const set = new Set([selected]);
    visual.edges.forEach((e) => {
      if (e.source === selected) set.add(e.target);
      if (e.target === selected) set.add(e.source);
    });
    return set;
  }, [selected, visual.edges]);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label="Knowledge graph"
      className="graph-reveal block select-none"
      onClick={() => onSelect(null)}
    >
      <defs>
        <marker id="kg-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1 L9 5 L1 9 z" fill="var(--color-ink-3)" />
        </marker>
      </defs>
      {visual.edges.map((e, i) => {
        const a = pos.get(e.source);
        const b = pos.get(e.target);
        if (!a || !b) return null;
        const active = selected && (e.source === selected || e.target === selected);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={i} opacity={neighbours && !active ? 0.12 : 1}>
            <path
              d={`M${a.x} ${a.y} L${mx} ${my} L${b.x} ${b.y}`}
              fill="none"
              stroke={active ? 'var(--color-ink-2)' : 'var(--color-line-strong)'}
              strokeWidth={active ? 1.6 : 1.2}
              markerMid="url(#kg-arrow)"
            />
            {active && (
              <text
                x={mx}
                y={my - 8}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={600}
                fill="var(--color-ink-2)"
                stroke="var(--color-paper)"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {e.relation}
              </text>
            )}
          </g>
        );
      })}
      {placed.map(({ node, x, y, w }) => {
        const color = GROUP_COLOR[node.group];
        const isSelected = selected === node.id;
        const dimmed = neighbours && !neighbours.has(node.id);
        return (
          <g
            key={node.id}
            transform={`translate(${x - w / 2} ${y - PILL_H / 2})`}
            opacity={dimmed ? 0.25 : 1}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`${node.label}, ${GROUP_LABEL[node.group]}`}
            aria-pressed={isSelected}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(isSelected ? null : node.id);
            }}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                onSelect(isSelected ? null : node.id);
              }
            }}
          >
            <rect
              width={w}
              height={PILL_H}
              rx={PILL_H / 2}
              fill={isSelected ? color : 'var(--color-sheet)'}
              stroke={color}
              strokeWidth={isSelected ? 0 : 1.6}
            />
            {!isSelected && <circle cx={12} cy={PILL_H / 2} r={3.5} fill={color} />}
            <text
              x={isSelected ? w / 2 : w / 2 + 5}
              y={PILL_H / 2 + FONT * 0.36}
              textAnchor="middle"
              fontSize={FONT}
              fontWeight={600}
              fill={isSelected ? '#fff' : 'var(--color-ink)'}
            >
              {fitLabel(node.label, w)}
            </text>
            <title>{node.label}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function KnowledgeGraph({ visual }: { visual: Visualization }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const inline = useWidth();
  const full = useWidth();
  const byId = useMemo(() => new Map(visual.nodes.map((n) => [n.id, n])), [visual.nodes]);
  const groups = useMemo(
    () => (Object.keys(GROUP_COLOR) as NodeGroup[]).filter((g) => visual.nodes.some((n) => n.group === g)),
    [visual.nodes],
  );
  const node = selected ? byId.get(selected) : undefined;

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  if (!visual.nodes.length) {
    return <p className="py-6 text-center text-small text-ink-3">No concepts could be mapped from this article.</p>;
  }

  const legend = (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-ink-2">
      {groups.map((g) => (
        <li key={g} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g] }} />
          {GROUP_LABEL[g]}
        </li>
      ))}
    </ul>
  );
  const detail = node && (
    <NodeDetail node={node} edges={visual.edges} byId={byId} onSelect={setSelected} onClose={() => setSelected(null)} />
  );

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        {legend}
        <IconButton label="Expand graph" onClick={() => setExpanded(true)} className="-mt-1.5 -mr-1.5">
          <Maximize2 size={15} />
        </IconButton>
      </div>
      <div ref={inline.ref} className="mt-2 rounded-[14px] border border-line bg-[radial-gradient(var(--color-cream-deep)_1px,transparent_1px)] [background-size:16px_16px]">
        {!expanded && <GraphCanvas visual={visual} width={inline.width} selected={selected} onSelect={setSelected} />}
      </div>
      {!expanded && (detail ?? <p className="mt-2 text-meta text-ink-3">Select a concept to see how it connects.</p>)}

      {expanded && (
        <div className="fade-in fixed inset-0 z-40 overflow-y-auto bg-paper" role="dialog" aria-modal="true" aria-label="Knowledge graph">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-heading font-semibold text-ink">Knowledge graph</p>
            <IconButton label="Close full screen" onClick={() => setExpanded(false)}>
              <Minimize2 size={16} />
            </IconButton>
          </div>
          <div className="px-4 pt-3 pb-8">
            {legend}
            <div ref={full.ref} className={cx('mt-2 rounded-[14px] border border-line bg-sheet/60')}>
              <GraphCanvas visual={visual} width={full.width} selected={selected} onSelect={setSelected} />
            </div>
            {detail}
          </div>
        </div>
      )}
    </div>
  );
}
