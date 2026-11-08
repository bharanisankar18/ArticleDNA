import { createContext, useCallback, useContext, useState } from 'react';
import type { LocateResult, LocateStatus } from '../shared/types';

/**
 * How the dashboard can reach the article's page. Provided by whichever view shows the dashboard.
 */
export interface Locator {
  /** 'ready' when the active tab is this article and can be read. */
  availability: 'ready' | 'other-page' | 'no-access';
  locate: (quote: string) => Promise<LocateResult>;
  openArticle?: () => void;
}

export const LocatorContext = createContext<Locator>({
  availability: 'no-access',
  locate: async () => ({ status: 'not_found' }),
});

export type LocateState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: LocateStatus; matchedText?: string }
  | { status: 'unavailable'; reason: 'other-page' | 'no-access' };

export function useLocate(quote: string) {
  const locator = useContext(LocatorContext);
  const [state, setState] = useState<LocateState>({ status: 'idle' });

  const run = useCallback(async () => {
    if (!quote) return;
    if (locator.availability !== 'ready') {
      setState({ status: 'unavailable', reason: locator.availability });
      return;
    }
    setState({ status: 'busy' });
    try {
      const result = await locator.locate(quote);
      setState({ status: result.status, matchedText: result.matchedText });
    } catch {
      setState({ status: 'unavailable', reason: 'no-access' });
    }
  }, [locator, quote]);

  return { state, run, locator };
}
