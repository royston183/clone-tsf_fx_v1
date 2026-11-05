// The BackEnd as an Azure Function App (Node 22, programming model v4): one HTTP function, `api`, answers every
// /api/* request through the same Fastify app as server.ts (CORS, security headers, the core router), with inject()
// instead of a listening port. `npm run build` bundles it into dist/function/ and zips it as dist/function.zip.
// Hosting rules (docs/deploy-function-app.md): one instance, because the core's write queues and its backend and lookup
// caches live in this process's memory (the database is shared: MySQL when deployed); DB_PATH on writable storage for a
// manual SQLite deployment. It serves the application's own data only; SAP is the browser's, through the relay.
import os from 'node:os';
import path from 'node:path';
import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import type { FastifyInstance } from 'fastify';
import { getConfig } from '@core/server/config';
import { setPlatform } from '@core/platform';
import { appRoot, runtimeNodePlatform } from './platform-node';
import { buildServer } from './server';

/**
 * The database file: DB_PATH, else the temp folder (the package folder is read-only under run-from-package, and the
 * temp folder is wiped on restart). Rollback journal, not WAL: WAL does not work on network shares (Azure Files).
 */
export function functionDbPath(env: Record<string, string | undefined> = process.env): string {
  const set = env.DB_PATH?.trim();
  return set ? (set === ':memory:' ? set : path.resolve(set)) : path.join(os.tmpdir(), 'app.db');
}

let ready: Promise<FastifyInstance> | undefined;
/** The Fastify app, built once per instance on the first request. */
export function functionApp(): Promise<FastifyInstance> {
  return (ready ??= (async () => {
    const root = appRoot();
    if (process.env.DB_ENGINE?.trim().toLowerCase() !== 'mysql' && !process.env.DB_PATH?.trim()) {
      console.warn(`DB_PATH is not set: using ${functionDbPath()}, which is lost on restart.`);
    }
    setPlatform(await runtimeNodePlatform(root, { sqliteFile: functionDbPath(), sqliteJournal: 'DELETE' }));
    const server = buildServer(getConfig());
    await server.ready();
    return server;
  })());
}

export async function handler(request: HttpRequest): Promise<HttpResponseInit> {
  const server = await functionApp();
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const res = await server.inject({
    method: request.method as 'GET',
    url: url.pathname + url.search,
    headers,
    payload: hasBody ? await request.text() : undefined
  });
  const out = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) out.append(key, String(v));
  }
  return { status: res.statusCode, headers: out, body: res.body };
}

app.http('api', {
  route: 'api/{*path}',
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  handler
});
