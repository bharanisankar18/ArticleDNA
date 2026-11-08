/**
 * Content script, injected on demand by the side panel (never automatically).
 * It exposes a small API on the isolated-world window object that the side panel calls via
 * chrome.scripting.executeScript. Nothing here sends data anywhere.
 */
import { extractArticle } from './extract';
import { clearHighlights, locatePassage } from './highlight';

declare global {
  interface Window {
    __articleDNA?: {
      version: number;
      extract: typeof extractArticle;
      locate: typeof locatePassage;
      clear: typeof clearHighlights;
    };
  }
}

const API_VERSION = 1;

if (!window.__articleDNA || window.__articleDNA.version !== API_VERSION) {
  window.__articleDNA = {
    version: API_VERSION,
    extract: () => extractArticle(document),
    locate: (quote: string) => locatePassage(quote),
    clear: () => clearHighlights(),
  };
}
