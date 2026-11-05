// The BackEnd of an FE + BE + DB application: the application's own data (never SAP), on its own port. The only code
// in the FrontEnd that calls an /api route; the page never calls its own origin.
import { HttpError, type ErrorDetail } from '@/lib/errors';
import { actingUser } from './sap-account';

/**
 * Where the BackEnd is: VITE_API_BASE_URL, else this page's host on the BackEnd port (VITE_API_PORT, default 3200).
 */
export function backendBase(env: Record<string, string | undefined> = import.meta.env ?? {}): string {
  const set = env.VITE_API_BASE_URL?.trim();
  if (set) return set.replace(/\/+$/, '');
  return `${location.protocol}//${location.hostname}:${env.VITE_API_PORT?.trim() || '3200'}`;
}

/** Raw response for imported service clients that must preserve upstream status and headers. */
export async function backendRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  return fetch(`${backendBase()}/api${path}`, {
    ...init,
    credentials: 'omit',
    headers: { ...headers, 'x-app-request': '1', 'x-app-user': actingUser() }
  });
}

/**
 * Calls the BackEnd's `/api<path>`. No cookies travel (`credentials: 'omit'`); the acting user goes as `x-app-user` and
 * every call carries `x-app-request: 1` (the BackEnd's write guard). A failure is an HttpError with the BackEnd's
 * message and details; a BackEnd that cannot be reached is 503 "Cannot reach the BackEnd.".
 */
export async function backendApi<T = unknown>(path: string, { method = 'GET', body, signal }: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await backendRequest(path, {
      method,
      credentials: 'omit',
      signal,
      headers: { 'x-app-request': '1', 'x-app-user': actingUser(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    // A cancelled request stays a cancellation (the screen ignores it).
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new HttpError(503, 'Cannot reach the BackEnd.');
  }
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { throw new HttpError(response.status >= 400 ? response.status : 502, `The BackEnd did not return JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const error = (data as { error?: { message?: string; details?: ErrorDetail[] } } | null)?.error;
    throw new HttpError(response.status, error?.message || `Request failed (${response.status}).`, error?.details ?? []);
  }
  return data as T;
}
