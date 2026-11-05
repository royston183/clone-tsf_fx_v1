// The BackEnd: the application's own data at /api/modules/… on its own port (PORT, default 3200), for the FrontEnd on
// another port (FRONTEND_PORT, default 3100). The FrontEnd's origins are allowed through CORS without credentials (no
// cookies, no sessions); the browser names the acting user in x-app-user, and every write still needs a listed origin
// and the x-app-request header (core/server/http.ts). SAP is the browser's, through the relay: never called from here.
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { getConfig, type AppConfig } from '@core/server/config';
import { setPlatform } from '@core/platform';
import { route } from '@core/server/router';
import { appRoot, loadEnvFile, runtimeNodePlatform } from './platform-node';
import type { RefDeps } from './ref/middleware-proxy';
import { isRefPath, routeRef } from './ref/routes';
import { AI_PATH, aiProposals, defaultAiDeps, type AiDeps } from './ai/proposals';

export const DEFAULT_PORT = 3200;
const BODY_LIMIT = 6 * 1024 * 1024;

/** The port from PORT (FS Sprint sets one per application) or 3200. Throws on a value that is not a port. */
export function portOf(env: Record<string, string | undefined> = process.env): number {
  const raw = (env.PORT ?? '').trim();
  const port = raw === '' ? DEFAULT_PORT : /^[1-9]\d{0,4}$/.test(raw) ? Number(raw) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new Error(`Invalid PORT "${raw}": use a whole number from 1 to 65535.`);
  return port;
}

/** The Fastify app over the core router, plus the reference routes under /api/ref/ (tests call it with inject()). */
export function buildServer(cfg: AppConfig, ref: RefDeps = {}, ai: AiDeps = defaultAiDeps()): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: BODY_LIMIT });
  // The core reads the raw body itself (size limit, content type, JSON errors), as it did under Next.js.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));
  void app.register(cors, {
    origin: cfg.origins,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'x-app-request', 'x-app-user'],
    maxAge: 600
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    reply.header('cache-control', 'no-store');
  });
  app.all('/api/*', async (req, reply) => {
    const url = `http://${req.headers.host ?? '127.0.0.1'}${req.url}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach(x => headers.append(k, x));
      else if (v !== undefined) headers.set(k, String(v));
    }
    const body = req.method === 'GET' || req.method === 'HEAD' || typeof req.body !== 'string' ? undefined : req.body;
    const request = new Request(url, { method: req.method, headers, body });
    const pathname = new URL(url).pathname;
    const res = pathname === AI_PATH && req.method === 'POST' ? await aiProposals(request, cfg, ai)
      : isRefPath(pathname) ? (await routeRef(request, cfg, ref))! : await route(request, cfg);
    reply.status(res.status);
    res.headers.forEach((value, key) => { reply.header(key, value); });
    return reply.send(await res.text());
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { message: 'Not found.', details: [] } }));
  return app;
}

export async function start(): Promise<FastifyInstance> {
  const root = appRoot();
  loadEnvFile(root);
  setPlatform(await runtimeNodePlatform(root));
  const cfg = getConfig();
  const app = buildServer(cfg);
  // 127.0.0.1 only: put an HTTPS proxy in front of it to serve other machines (README → Security).
  await app.listen({ host: '127.0.0.1', port: portOf() });
  process.stdout.write(`BackEnd on http://127.0.0.1:${portOf()} (FrontEnd origins: ${cfg.origins.join(', ')})\n`);
  return app;
}

const entry = process.argv[1] ?? '';
if (/server\.(ts|mjs|js)$/.test(entry)) {
  start().catch((error: unknown) => {
    process.stderr.write(`The BackEnd could not start: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
