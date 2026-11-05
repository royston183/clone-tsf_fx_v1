// The reference screens' API, ported from the TSF - FX Application gateway, in front of the core router (server.ts):
//   /api/ref/middleware/<path>   the SLC middleware, passed through (middleware-proxy.ts)
//   /api/ref/localdb/<resource>  the gateway's table routes (localdb.ts)
// Writes follow the core's rule (core/server/http.ts assertTrustedWrite): a listed origin and the x-app-request header.
import type { AppConfig } from '@core/server/config';
import { assertTrustedWrite } from '@core/server/http';
import { HttpError } from '@/lib/errors';
import { LOCALDB_PREFIX, refError, routeLocalDb } from './localdb';
import { proxyMiddleware, type RefDeps } from './middleware-proxy';

export const REF_PREFIX = '/api/ref/';
const MIDDLEWARE_PREFIX = '/api/ref/middleware';

/** Whether a request path belongs to the reference routes. */
export const isRefPath = (pathname: string): boolean => pathname.startsWith(REF_PREFIX);

/** Answers a /api/ref/ request, or null when the path is not one. */
export async function routeRef(req: Request, cfg: AppConfig, deps: RefDeps = {}): Promise<Response | null> {
  const pathname = new URL(req.url).pathname;
  if (!isRefPath(pathname)) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try { assertTrustedWrite(req, cfg); } catch (error) {
      if (error instanceof HttpError) return refError(error.status, error.message);
      throw error;
    }
  }
  if (pathname === MIDDLEWARE_PREFIX || pathname.startsWith(`${MIDDLEWARE_PREFIX}/`)) {
    return proxyMiddleware(req, pathname.slice(MIDDLEWARE_PREFIX.length + 1), deps);
  }
  if (pathname === LOCALDB_PREFIX || pathname.startsWith(`${LOCALDB_PREFIX}/`)) return routeLocalDb(req, deps);
  return refError(404, `No reference route for ${pathname}.`);
}
