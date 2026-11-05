import { useEffect, useState } from 'react';
import type { HttpError } from '@/lib/errors';

export interface PostState<T> {
  data: T | null;
  /** The answer of the last request that succeeded (kept on screen while a new one loads). */
  last: T | null;
  error: HttpError | null;
  loading: boolean;
  retry: () => void;
}

/**
 * Calls `fn(id, body)` (a data-client function, src/lib/client/data.ts) whenever the module or body changes, or `retry`
 * is called; a null id or body calls nothing. A newer call cancels the one in flight. State changes only when an answer
 * arrives (no synchronous setState in the effect).
 */
export function usePost<T, B>(fn: (id: string, body: B, signal?: AbortSignal) => Promise<T>, id: string | null, body: B | null | undefined): PostState<T> {
  const [attempt, setAttempt] = useState(0);
  const key = id === null || body === null || body === undefined ? null : JSON.stringify([id, body, attempt]);
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: HttpError | null; last: T | null }>({ key: null, data: null, error: null, last: null });
  useEffect(() => {
    if (key === null) return;
    const [m, b] = JSON.parse(key) as [string, B];
    const controller = new AbortController();
    fn(m, b, controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ key, data, error: null, last: data }); },
      (e: HttpError) => { if (!controller.signal.aborted) setResult(r => ({ key, data: null, error: e, last: r.last })); }
    );
    return () => controller.abort();
  }, [key, fn]);
  const current = key !== null && result.key === key;
  return { data: current ? result.data : null, last: result.last, error: current ? result.error : null, loading: key !== null && !current, retry: () => setAttempt(a => a + 1) };
}
