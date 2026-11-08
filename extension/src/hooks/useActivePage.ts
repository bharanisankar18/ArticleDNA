import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCESS_GRANTED } from '../shared/constants';
import { extractFromTab, getActiveTab, PageAccessError, type PageAccessCode } from '../services/pageBridge';
import type { ExtractedArticle, ExtractionFailureCode } from '../shared/types';

export type BlockedCode = PageAccessCode | ExtractionFailureCode;

export type PageState =
  | { kind: 'loading' }
  | { kind: 'ready'; tabId: number; article: ExtractedArticle }
  | { kind: 'blocked'; tabId: number | null; code: BlockedCode; message: string };

/**
 * Tracks the active tab of this window and extracts its article. Extraction runs locally in the
 * page; nothing is sent anywhere until the user asks for an analysis.
 */
export function useActivePage() {
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const seq = useRef(0);
  const windowId = useRef<number | null>(null);
  const activeTabId = useRef<number | null>(null);
  const lastUrl = useRef<string | null>(null);

  const read = useCallback(async (quiet = false) => {
    const id = ++seq.current;
    if (!quiet) setState({ kind: 'loading' });
    let tab: chrome.tabs.Tab | null = null;
    try {
      tab = await getActiveTab();
    } catch {
      tab = null;
    }
    if (id !== seq.current) return;
    if (!tab?.id) {
      activeTabId.current = null;
      setState({ kind: 'blocked', tabId: null, code: 'no-tab', message: 'No active tab.' });
      return;
    }
    activeTabId.current = tab.id;
    try {
      const result = await extractFromTab(tab.id, tab.url);
      if (id !== seq.current) return;
      if (result.ok) {
        lastUrl.current = result.article.url;
        setState({ kind: 'ready', tabId: tab.id, article: result.article });
      } else {
        lastUrl.current = null;
        setState({ kind: 'blocked', tabId: tab.id, code: result.code, message: result.message });
      }
    } catch (error) {
      if (id !== seq.current) return;
      const err = error instanceof PageAccessError ? error : new PageAccessError('unknown', String(error));
      lastUrl.current = null;
      setState({ kind: 'blocked', tabId: tab.id, code: err.code, message: err.message });
    }
  }, []);

  useEffect(() => {
    chrome.windows
      .getCurrent()
      .then((w) => (windowId.current = w.id ?? null))
      .catch(() => undefined);
    read();

    let debounce: number | undefined;
    const schedule = (quiet: boolean) => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => read(quiet), 120);
    };

    const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
      if (windowId.current === null || info.windowId === windowId.current) schedule(false);
    };
    const onUpdated = (tabId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (tabId !== activeTabId.current) return;
      // Same document re-finished loading: refresh quietly so the current view doesn't flash.
      if (change.status === 'complete') schedule(true);
      else if (change.url && change.url !== lastUrl.current) schedule(false);
    };
    const onMessage = (message: { type?: string; tabId?: number }) => {
      if (message?.type === ACCESS_GRANTED) schedule(false);
    };
    const onPermissions = () => schedule(false);

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.permissions.onAdded.addListener(onPermissions);
    return () => {
      window.clearTimeout(debounce);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.permissions.onAdded.removeListener(onPermissions);
    };
  }, [read]);

  return { state, refresh: () => read(false) };
}
