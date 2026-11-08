import { matchQuote, type Span } from '../shared/textMatch';
import type { LocateResult } from '../shared/types';

const HIGHLIGHT_EXACT = 'articledna-match';
const HIGHLIGHT_APPROX = 'articledna-approx';
const STYLE_ID = 'articledna-highlight-style';
const PULSE_ID = 'articledna-pulse';
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG']);
const ALNUM = /[\p{L}\p{N}]/u;

/** Normalised page text with a map from every normalised character back to its DOM position. */
interface TextIndex {
  text: string;
  nodes: Text[];
  nodeOf: Int32Array;
  offsetOf: Int32Array; // UTF-16 offset of the source character inside its text node
  lengthOf: Uint8Array; // UTF-16 length of the source character (1 or 2)
}

function isVisible(el: Element, cache: WeakMap<Element, boolean>): boolean {
  const known = cache.get(el);
  if (known !== undefined) return known;
  const visible =
    typeof (el as HTMLElement).checkVisibility === 'function'
      ? (el as HTMLElement).checkVisibility({ visibilityProperty: true, opacityProperty: false } as CheckVisibilityOptions)
      : true;
  cache.set(el, visible);
  return visible;
}

export function buildTextIndex(root: Node = document.body): TextIndex {
  const visibility = new WeakMap<Element, boolean>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP.has(parent.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`#${PULSE_ID}`)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || !/\S/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      return isVisible(parent, visibility) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes: Text[] = [];
  const chars: string[] = [];
  const nodeOf: number[] = [];
  const offsetOf: number[] = [];
  const lengthOf: number[] = [];
  let current = walker.nextNode() as Text | null;
  while (current) {
    const nodeIndex = nodes.push(current) - 1;
    const data = current.data;
    let offset = 0;
    for (const ch of data) {
      // A single source character can normalise to several (e.g. the "fi" ligature).
      for (const n of ch.normalize('NFKC').toLowerCase()) {
        if (ALNUM.test(n)) {
          chars.push(n);
          nodeOf.push(nodeIndex);
          offsetOf.push(offset);
          lengthOf.push(ch.length);
        }
      }
      offset += ch.length;
    }
    current = walker.nextNode() as Text | null;
  }
  return {
    text: chars.join(''),
    nodes,
    nodeOf: Int32Array.from(nodeOf),
    offsetOf: Int32Array.from(offsetOf),
    lengthOf: Uint8Array.from(lengthOf),
  };
}

function spanToRange(index: TextIndex, span: Span): Range {
  const range = document.createRange();
  const startNode = index.nodes[index.nodeOf[span.start]];
  const last = span.end - 1;
  const endNode = index.nodes[index.nodeOf[last]];
  range.setStart(startNode, index.offsetOf[span.start]);
  range.setEnd(endNode, index.offsetOf[last] + index.lengthOf[last]);
  return range;
}

/** Approximate matches are built from fixed-size chunks; widen them so no word is cut in half. */
function expandToWholeWords(range: Range) {
  const isWordChar = (ch: string | undefined) => !!ch && ALNUM.test(ch);
  const start = range.startContainer;
  if (start.nodeType === Node.TEXT_NODE) {
    const data = (start as Text).data;
    let offset = range.startOffset;
    while (offset > 0 && isWordChar(data[offset - 1])) offset--;
    range.setStart(start, offset);
  }
  const end = range.endContainer;
  if (end.nodeType === Node.TEXT_NODE) {
    const data = (end as Text).data;
    let offset = range.endOffset;
    while (offset < data.length && isWordChar(data[offset])) offset++;
    range.setEnd(end, offset);
  }
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    ::highlight(${HIGHLIGHT_EXACT}) { background-color: rgba(77, 87, 230, 0.26); color: inherit; }
    ::highlight(${HIGHLIGHT_APPROX}) { background-color: rgba(214, 158, 22, 0.32); color: inherit; }
    #${PULSE_ID} {
      position: fixed; pointer-events: none; z-index: 2147483647; border-radius: 6px;
      box-shadow: 0 0 0 2px rgba(77, 87, 230, 0.9), 0 0 0 7px rgba(77, 87, 230, 0.18);
      opacity: 0; transition: opacity 280ms ease;
    }
    #${PULSE_ID}[data-approx="true"] {
      box-shadow: 0 0 0 2px rgba(176, 124, 8, 0.95), 0 0 0 7px rgba(214, 158, 22, 0.2);
    }
    @media (prefers-reduced-motion: reduce) { #${PULSE_ID} { transition: none; } }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}

function scrollParent(el: Element | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body && node !== document.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 4) return node;
    node = node.parentElement;
  }
  return null;
}

function scrollToRange(range: Range) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduce ? 'auto' : 'smooth';
  const rect = range.getBoundingClientRect();
  const anchor = range.startContainer.parentElement;
  if (rect.height === 0 && rect.width === 0) {
    anchor?.scrollIntoView({ block: 'center', behavior });
    return;
  }
  const container = scrollParent(anchor);
  if (container) {
    const box = container.getBoundingClientRect();
    container.scrollBy({ top: rect.top - box.top - container.clientHeight * 0.3, behavior });
  } else {
    window.scrollBy({ top: rect.top - window.innerHeight * 0.3, behavior });
  }
}

let pulseTimer: number | undefined;

function pulse(range: Range, approximate: boolean) {
  window.clearTimeout(pulseTimer);
  document.getElementById(PULSE_ID)?.remove();
  const show = () => {
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const box = document.createElement('div');
    box.id = PULSE_ID;
    box.dataset.approx = String(approximate);
    const pad = 4;
    Object.assign(box.style, {
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    });
    document.documentElement.appendChild(box);
    requestAnimationFrame(() => (box.style.opacity = '1'));
    pulseTimer = window.setTimeout(() => {
      box.style.opacity = '0';
      pulseTimer = window.setTimeout(() => box.remove(), 320);
    }, 1400);
  };
  // Wait for the smooth scroll to settle before drawing the outline at the final position.
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    window.removeEventListener('scrollend', once, true);
    show();
  };
  window.addEventListener('scrollend', once, { capture: true, once: true });
  window.setTimeout(once, 650);
}

export function clearHighlights() {
  CSS.highlights?.delete(HIGHLIGHT_EXACT);
  CSS.highlights?.delete(HIGHLIGHT_APPROX);
  document.getElementById(PULSE_ID)?.remove();
}

export function locatePassage(quote: string): LocateResult {
  clearHighlights();
  if (!document.body) return { status: 'not_found' };
  const index = buildTextIndex(document.body);
  const match = matchQuote(index.text, quote);
  if (match.status === 'not_found') return { status: 'not_found' };

  const ranges = match.spans.map((span) => spanToRange(index, span));
  const approximate = match.status === 'approximate';
  if (approximate) ranges.forEach(expandToWholeWords);
  ensureStyle();
  if (typeof Highlight !== 'undefined' && CSS.highlights) {
    CSS.highlights.set(approximate ? HIGHLIGHT_APPROX : HIGHLIGHT_EXACT, new Highlight(...ranges));
  }
  scrollToRange(ranges[0]);
  pulse(ranges[0], approximate);

  const matchedText = ranges
    .map((r) => r.toString())
    .join(' … ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  return { status: match.status, matchedText };
}
