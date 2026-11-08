import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, checkHealth } from '../services/api';
import type { HealthResponse } from '../shared/types';

export type HealthState =
  | { status: 'checking' }
  | { status: 'online'; health: HealthResponse }
  | { status: 'offline'; error: ApiError };

const RETRY_OFFLINE_MS = 15_000;
const RECHECK_ONLINE_MS = 60_000;

export function useBackendHealth(baseUrl: string, enabled = true) {
  const [state, setState] = useState<HealthState>({ status: 'checking' });
  const seq = useRef(0);

  const check = useCallback(async () => {
    const id = ++seq.current;
    try {
      const health = await checkHealth(baseUrl);
      if (id === seq.current) setState({ status: 'online', health });
      return true;
    } catch (error) {
      if (id === seq.current) {
        setState({
          status: 'offline',
          error: error instanceof ApiError ? error : new ApiError('BACKEND_UNREACHABLE', String(error)),
        });
      }
      return false;
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    let alive = true;
    const loop = async () => {
      const ok = await check();
      if (alive) timer = window.setTimeout(loop, ok ? RECHECK_ONLINE_MS : RETRY_OFFLINE_MS);
    };
    setState({ status: 'checking' });
    loop();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [check, enabled]);

  return { state, recheck: check };
}
