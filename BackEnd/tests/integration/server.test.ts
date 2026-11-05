import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { migrations, openDb } from '../../src/db';
import { buildServer } from '../../src/server';
import { freshStore, SCHEMA_DIR, testConfig } from '../support/config';

const FRONTEND = 'http://localhost:3100';

describe('the BackEnd server (Fastify over the core router): the application\'s own data only', () => {
  let app: FastifyInstance;
  beforeAll(async () => { freshStore(); app = buildServer(testConfig({ APP_ORIGINS: `http://127.0.0.1:3100,${FRONTEND}` })); await app.ready(); });
  afterAll(async () => { await app.close(); });

  const write = (method: 'POST', url: string, payload: unknown, headers: Record<string, string> = {}) => app.inject({
    method, url, headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json', ...headers }, payload: JSON.stringify(payload)
  });
  const LAYOUT = { columns: ['deal', 'name', 'amount'], sort: [], subtotals: [], unit: null, subtotalsOnly: false, pageSize: 50 };
  /** Saves a personal Deals layout with the acting user in x-app-user and answers who saved it (changedBy). */
  async function saveLayoutAs(user: string | undefined, name: string): Promise<string> {
    const res = await app.inject({
      method: 'PUT', url: '/api/modules/sample-deals/layouts',
      headers: { origin: FRONTEND, 'x-app-request': '1', 'content-type': 'application/json', ...(user === undefined ? {} : { 'x-app-user': user }) },
      payload: JSON.stringify({ name, description: '', scope: 'personal', isDefault: false, layout: LAYOUT })
    });
    expect(res.statusCode).toBe(200);
    return (res.json().layouts as { name: string; changedBy: string }[]).find(l => l.name === name)!.changedBy;
  }

  it('answers the FrontEnd origins through CORS without credentials, allowing x-app-user, and no other origin', async () => {
    for (const origin of ['http://127.0.0.1:3100', FRONTEND]) {
      const ok = await app.inject({ method: 'OPTIONS', url: '/api/modules/sample-deals/deals', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-app-request,x-app-user' } });
      expect(ok.headers['access-control-allow-origin']).toBe(origin);
      expect(String(ok.headers['access-control-allow-headers'])).toContain('x-app-user');
      expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    }
    const evil = await app.inject({ method: 'OPTIONS', url: '/api/modules/sample-deals', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('serves an app module with no cookie and no session', async () => {
    const view = await app.inject({ method: 'GET', url: '/api/modules/sample-deals', headers: { origin: FRONTEND } });
    expect(view.statusCode).toBe(200);
    expect(view.headers['cache-control']).toBe('no-store');
    expect(view.headers['set-cookie']).toBeUndefined();
  });
  it('answers 404 for a module inside SAP and for a module still on sample data', async () => {
    const message = 'This application\'s data is not kept by the BackEnd.';
    for (const url of ['/api/modules/timebuckets', '/api/modules/sample-monthly']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.message, url).toBe(message);
    }
    expect((await app.inject({ method: 'GET', url: '/api/modules/sample-cashflow/layouts' })).statusCode).toBe(404);
  });
  it('answers GET /api/health with the build it runs (no data, no header needed): CI waits for it before the website', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, build: '' });
  });

  it('has no sign-in, workspace or SAP check routes', async () => {
    expect((await write('POST', '/api/session', { username: 'demo', password: 'x' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/workspace' })).statusCode).toBe(404);
    expect((await write('POST', '/api/sap/check/timebuckets', {})).statusCode).toBe(404);
  });
  it('stamps the acting user from x-app-user, upper case; an empty, long or odd name is DEMO', async () => {
    expect(await saveLayoutAs('karthik', 'By Karthik')).toBe('KARTHIK');
    expect(await saveLayoutAs(undefined, 'Nobody')).toBe('DEMO');
    for (const user of ['', 'a'.repeat(40), 'a:b']) expect(await saveLayoutAs(user, `As ${user.length}`), JSON.stringify(user)).toBe('DEMO');
  });
  it('refuses a write without the app header or from another origin (403)', async () => {
    const rows = { rows: [] };
    expect((await app.inject({ method: 'POST', url: '/api/modules/sample-deals/deals/query', headers: { origin: FRONTEND, 'content-type': 'application/json' }, payload: JSON.stringify(rows) })).statusCode).toBe(403);
    expect((await write('POST', '/api/modules/sample-deals/deals/query', rows, { origin: 'http://evil.example' })).statusCode).toBe(403);
  });
  it('answers unknown paths 404 and unknown methods 405, in the JSON error shape', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/nothing/here' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: { message: 'Not found.', details: [] } });
    expect((await app.inject({ method: 'PUT', url: '/api/modules/sample-deals' })).statusCode).toBe(405);
    expect((await app.inject({ method: 'GET', url: '/elsewhere' })).statusCode).toBe(404);
  });
  it('routes fixed segments before a table name (/items is the items API)', async () => {
    // Deals is an object module: its items API answers 404 'Unknown application.' (no application given), never the table change route (405 on GET).
    const res = await app.inject({ method: 'GET', url: '/api/modules/sample-deals/items' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { message: 'Unknown application.', details: [] } });
  });
});

describe('DB migrations', () => {
  it('lists DB/schema in order and applies each once', () => {
    // An application adds its own generated migrations after the template's four, so only those are pinned.
    const versions = migrations(SCHEMA_DIR).map(m => m.version);
    expect(versions.slice(0, 4)).toEqual(['0001_init', '0002_app_store', '0003_app_modules', '0004_drop_app_store']);
    expect(versions).toEqual([...versions].sort());
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'smui-db-')), 'app.db');
    const db = openDb(file, SCHEMA_DIR);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(t => t.name);
    expect(tables).toEqual(expect.arrayContaining(['app_modules', 'layouts', 'schema_migrations']));
    expect(tables).not.toContain('app_store');
    expect(tables).not.toContain('mock_store');
    db.close();
    // Opening again applies nothing new.
    const again = openDb(file, SCHEMA_DIR);
    expect((again.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBe(versions.length);
    again.close();
  });
  it('applies a new migration on the next start', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'smui-schema-'));
    writeFileSync(path.join(dir, '0001_a.sql'), 'CREATE TABLE a (x TEXT);');
    const file = path.join(dir, 'app.db');
    openDb(file, dir).close();
    writeFileSync(path.join(dir, '0002_b.sql'), 'CREATE TABLE b (y TEXT);');
    const db = openDb(file, dir);
    expect((db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[]).map(r => r.version)).toEqual(['0001_a', '0002_b']);
    db.close();
  });
});
