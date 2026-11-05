// /api/ref/middleware/<path>: the SLC middleware (the REST service `slc-middleware`, FrontEnd/src/config/rest-services.json)
// behind the BackEnd, as the reference gateway's /api/middleware/<path> was: same method, path, query and JSON body
// go through, the answer's status and body come back unchanged. Only a failure to reach it is the BackEnd's own answer (502).
import { restEnvName, REST_SERVICES } from '@/config/rest-services';

export const MIDDLEWARE_KEY = 'slc-middleware';
const TIMEOUT_MS = 30000;
/** Answer headers worth returning (a created entity's key travels in Location / OData-EntityId). */
const PASSTHROUGH = ['content-type', 'odata-entityid', 'location', 'odata-version', 'etag'];

/** What the reference routes need from outside: tests replace them. */
export interface RefDeps { fetch?: typeof fetch; env?: Record<string, string | undefined>; timeoutMs?: number }

export interface MiddlewareAnswer { status: number; headers: Record<string, string>; body: string }

/** The middleware's base URL (REST_SLC_MIDDLEWARE_URL overrides rest-services.json) and its Authorization header, when set. */
export function middlewareEndpoint(env: Record<string, string | undefined>): { base: string; headers: Record<string, string> } {
  const def = REST_SERVICES.find(s => s.key === MIDDLEWARE_KEY);
  const base = (env[restEnvName(MIDDLEWARE_KEY, 'URL')]?.trim() || def?.base || '').replace(/\/+$/, '');
  const authorization = env[restEnvName(MIDDLEWARE_KEY, 'AUTHORIZATION')]?.trim();
  return { base, headers: authorization ? { authorization } : {} };
}

const errorBody = (message: string): string => JSON.stringify({ error: { message: { value: message } } });

/**
 * One call to the middleware. `path` is the part after the base (`data/comp`), `query` without the `?`. A network failure,
 * a timeout or a missing base URL is 502 / 503 with an error body shaped like the reference gateway's.
 */
export async function callMiddleware(
  deps: RefDeps,
  method: string,
  path: string,
  query: string,
  body?: string,
  headers: { contentType?: string; accept?: string; ifMatch?: string } = {}
): Promise<MiddlewareAnswer> {
  const endpoint = middlewareEndpoint(deps.env ?? process.env);
  if (!endpoint.base) return { status: 503, headers: { 'content-type': 'application/json' }, body: errorBody(`The SLC middleware has no URL: set ${restEnvName(MIDDLEWARE_KEY, 'URL')}.`) };
  const url = `${endpoint.base}/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
  const send: Record<string, string> = { accept: headers.accept || 'application/json', ...endpoint.headers };
  if (body !== undefined && headers.contentType) send['content-type'] = headers.contentType;
  if (headers.ifMatch && method !== 'GET') send['if-match'] = headers.ifMatch;
  try {
    const res = await (deps.fetch ?? fetch)(url, {
      method,
      headers: send,
      body: body === undefined || method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS)
    });
    const out: Record<string, string> = {};
    for (const name of PASSTHROUGH) { const v = res.headers.get(name); if (v) out[name] = v; }
    return { status: res.status, headers: out, body: await res.text() };
  } catch (error) {
    const message = (error as Error)?.name === 'TimeoutError'
      ? 'The SLC middleware did not answer in time. Try again.'
      : `Cannot reach the SLC middleware: ${(error as Error)?.message ?? 'network error'}.`;
    return { status: 502, headers: { 'content-type': 'application/json' }, body: errorBody(message) };
  }
}

/** The proxy route: the request as it came, to the middleware. */
export async function proxyMiddleware(req: Request, path: string, deps: RefDeps): Promise<Response> {
  // Dot segments would climb out of the service's path (a Request already resolves plain ones; this refuses the encoded ones).
  if (path.split('/').some(seg => { try { return decodeURIComponent(seg) === '..'; } catch { return true; } })) {
    return new Response(errorBody('Invalid middleware path.'), { status: 400, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const raw = hasBody ? await req.text() : '';
  const answer = await callMiddleware(deps, req.method, path, new URL(req.url).search.replace(/^\?/, ''), raw === '' ? undefined : raw, {
    contentType: req.headers.get('content-type') ?? undefined,
    accept: req.headers.get('accept') ?? undefined,
    ifMatch: req.headers.get('if-match') ?? undefined
  });
  const headers = new Headers(answer.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-store');
  const empty = [101, 204, 205, 304].includes(answer.status);
  return new Response(empty ? null : answer.body, { status: answer.status, headers });
}
