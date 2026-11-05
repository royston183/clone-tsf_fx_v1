// The BackEnd's HTTP API, /api/modules/…: one table of routes over the request handlers, for the application's own
// data (BackEnd/src/server.ts). The browser calls the same services directly (FrontEnd/src/lib/client/data.ts).
import { HttpError } from '@/lib/errors';
import type { AppConfig } from './config';
import { dashboardRequest } from './dashboard-service';
import { moduleChange, moduleQuery, moduleView } from './handlers';
import { handle, json } from './http';
import { itemsRequest } from './items-service';
import { layoutsRequest } from './layout-service';
import { objectActionRequest, objectRequest } from './object-service';
import { reportRequest } from './report-service';
import { uploadRequest } from './upload-service';

type Params = Record<string, string>;
type Handler = (req: Request, cfg: AppConfig, p: Params) => Promise<Response>;
interface Route { pattern: string[]; methods: Record<string, Handler> }

const objectWhat = { GET: 'read', POST: 'create', PATCH: 'update', DELETE: 'delete' } as const;

// Fixed segments win over `:table` (as Next.js routed them): /items is the items API, never a table named items.
/** The commit the BackEnd was built from (BackEnd/scripts/build.mjs defines it from GITHUB_SHA); '' in a local run. */
declare const __APP_BUILD__: string | undefined;
const appBuild = (): string => (typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '');

const ROUTES: Route[] = [
  // Which build answers: the deploy waits for the new commit before it publishes the website. No data, no header needed.
  { pattern: ['health'], methods: { GET: async () => json({ ok: true, build: appBuild() }) } },
  { pattern: ['modules', ':module'], methods: { GET: (r, c, p) => moduleView(r, c, p.module) } },
  { pattern: ['modules', ':module', 'dashboard'], methods: { POST: (r, c, p) => dashboardRequest(r, c, p.module, 'load') } },
  { pattern: ['modules', ':module', 'dashboard', 'range'], methods: { POST: (r, c, p) => dashboardRequest(r, c, p.module, 'section') } },
  { pattern: ['modules', ':module', 'items'], methods: { GET: (r, c, p) => itemsRequest(r, c, p.module), POST: (r, c, p) => itemsRequest(r, c, p.module) } },
  {
    pattern: ['modules', ':module', 'layouts'],
    methods: { GET: (r, c, p) => layoutsRequest(r, c, p.module), PUT: (r, c, p) => layoutsRequest(r, c, p.module), DELETE: (r, c, p) => layoutsRequest(r, c, p.module) }
  },
  {
    pattern: ['modules', ':module', 'object'],
    methods: Object.fromEntries(Object.entries(objectWhat).map(([m, what]) => [m, (r: Request, c: AppConfig, p: Params) => objectRequest(r, c, p.module, what)]))
  },
  { pattern: ['modules', ':module', 'object', 'action', ':action'], methods: { POST: (r, c, p) => objectActionRequest(r, c, p.module, p.action) } },
  { pattern: ['modules', ':module', 'report'], methods: { POST: (r, c, p) => reportRequest(r, c, p.module, 'run') } },
  { pattern: ['modules', ':module', 'report', 'breakdown'], methods: { POST: (r, c, p) => reportRequest(r, c, p.module, 'breakdown') } },
  { pattern: ['modules', ':module', 'upload', 'check'], methods: { POST: (r, c, p) => uploadRequest(r, c, p.module, 'check') } },
  { pattern: ['modules', ':module', 'upload', 'post'], methods: { POST: (r, c, p) => uploadRequest(r, c, p.module, 'post') } },
  {
    pattern: ['modules', ':module', ':table'],
    methods: Object.fromEntries(['POST', 'PATCH', 'DELETE'].map(m => [m, (r: Request, c: AppConfig, p: Params) => moduleChange(r, c, p.module, p.table)]))
  },
  { pattern: ['modules', ':module', ':table', 'query'], methods: { POST: (r, c, p) => moduleQuery(r, c, p.module, p.table) } }
];

const fixedCount = (r: Route) => r.pattern.filter(s => !s.startsWith(':')).length;
const ORDERED = [...ROUTES].sort((a, b) => fixedCount(b) - fixedCount(a));

function match(segments: string[]): { route: Route; params: Params } | null {
  for (const route of ORDERED) {
    if (route.pattern.length !== segments.length) continue;
    const params: Params = {};
    const ok = route.pattern.every((p, i) => {
      if (p.startsWith(':')) { params[p.slice(1)] = segments[i]; return true; }
      return p === segments[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

/** Answers one /api request; any thrown error becomes the JSON error shape. */
export function route(req: Request, cfg: AppConfig): Promise<Response> {
  return handle(async () => {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) throw new HttpError(404, 'Not found.');
    let segments: string[];
    try { segments = pathname.slice('/api/'.length).split('/').filter(Boolean).map(decodeURIComponent); } catch { throw new HttpError(400, 'Invalid path.'); }
    const found = match(segments);
    if (!found) throw new HttpError(404, 'Not found.');
    const handler = found.route.methods[req.method];
    if (!handler) throw new HttpError(405, 'Method not allowed.');
    return handler(req, cfg, found.params);
  });
}
