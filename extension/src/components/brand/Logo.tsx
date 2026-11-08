import { MARK_LINES, MARK_PAPER, MARK_VIEWBOX } from './markGeometry';

/** The full ArticleDNA lockup (mark + wordmark). */
export function Lockup({ height = 26 }: { height?: number }) {
  return <img src="/brand/logo-lockup-ui.svg" alt="ArticleDNA" style={{ height }} className="block w-auto select-none" draggable={false} />;
}

/**
 * The mark with its document lines "being read": used while an analysis runs.
 * The base artwork is the real logo; only the six text lines are animated on top of it.
 */
export function ReadingMark({ size = 56 }: { size?: number }) {
  return (
    <svg
      viewBox={`0 0 ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`}
      style={{ height: size, width: (size * MARK_VIEWBOX.width) / MARK_VIEWBOX.height }}
      role="img"
      aria-label="Analyzing"
    >
      <image href="/brand/logo-mark-base.svg" width={MARK_VIEWBOX.width} height={MARK_VIEWBOX.height} />
      {MARK_LINES.map((line, i) => (
        <rect
          key={i}
          className="reading-line"
          style={{ animationDelay: `${i * 0.14}s` }}
          x={line.x}
          y={line.y}
          width={line.width}
          height={line.height}
          rx={line.rx}
          fill={MARK_PAPER}
        />
      ))}
    </svg>
  );
}
