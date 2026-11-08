/**
 * Talks to the current tab: injects the content script on demand and calls its functions.
 */
import type { ExtractionResult, LocateResult } from '../shared/types';

export type PageAccessCode =
  | 'restricted' // chrome://, the Web Store, other extensions
  | 'permission' // activeTab not granted for this tab yet
  | 'file' // file:// without "Allow access to file URLs"
  | 'error-page'
  | 'no-tab'
  | 'unknown';

export class PageAccessError extends Error {
  constructor(
    public code: PageAccessCode,
    message: string,
  ) {
    super(message);
  }
}

function classify(error: unknown, url?: string): PageAccessError {
  const message = error instanceof Error ? error.message : String(error);
  const m = message.toLowerCase();
  if (url?.startsWith('file:') || m.includes('file://')) {
    return new PageAccessError('file', message);
  }
  if (
    m.includes('chrome://') ||
    m.includes('edge://') ||
    m.includes('about:') ||
    m.includes('extensions gallery') ||
    m.includes('chrome-extension://') ||
    m.includes('chrome-search://') ||
    m.includes('webstore') ||
    m.includes('devtools://')
  ) {
    return new PageAccessError('restricted', message);
  }
  if (m.includes('error page')) return new PageAccessError('error-page', message);
  if (m.includes('no tab with id') || m.includes('no tab')) return new PageAccessError('no-tab', message);
  if (m.includes('cannot access') || m.includes('permission') || m.includes('host')) {
    return new PageAccessError('permission', message);
  }
  return new PageAccessError('unknown', message);
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function ensureInjected(tabId: number) {
  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => typeof window.__articleDNA === 'object',
  });
  if (!probe?.result) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

async function call<T>(tabId: number, run: () => Promise<T>, url?: string): Promise<T> {
  try {
    await ensureInjected(tabId);
    return await run();
  } catch (error) {
    throw classify(error, url);
  }
}

export async function extractFromTab(tabId: number, url?: string): Promise<ExtractionResult> {
  return call(
    tabId,
    async () => {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__articleDNA!.extract(),
      });
      if (!res || res.result === undefined) throw new Error('The page did not respond.');
      return res.result as ExtractionResult;
    },
    url,
  );
}

export async function locateInTab(tabId: number, quote: string): Promise<LocateResult> {
  return call(tabId, async () => {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (q: string) => window.__articleDNA!.locate(q),
      args: [quote],
    });
    return (res?.result as LocateResult) ?? { status: 'not_found' };
  });
}

export async function clearInTab(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__articleDNA?.clear(),
    });
  } catch {
    /* page navigated away or access was revoked; nothing to clear */
  }
}

// ---------------------------------------------------------------- optional site access
export const ALL_SITES: chrome.permissions.Permissions = { origins: ['https://*/*', 'http://*/*'] };

export function hasAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.contains(ALL_SITES);
}

export function requestAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.request(ALL_SITES);
}

export function removeAllSitesAccess(): Promise<boolean> {
  return chrome.permissions.remove(ALL_SITES);
}
