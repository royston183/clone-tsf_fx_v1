import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '@core/server/config';
import { route } from '@core/server/router';
import { freshStore, testConfig } from '../support/config';

const ORIGIN = 'http://localhost:3100';
const NOT_KEPT = 'This application\'s data is not kept by the BackEnd.';

function request(pathname: string, { method = 'GET', body, origin = ORIGIN, user, appHeader = method !== 'GET' }: { method?: string; body?: unknown; origin?: string | null; user?: string; appHeader?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (appHeader) headers['x-app-request'] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (user !== undefined) headers['x-app-user'] = user;
  return new Request(`http://127.0.0.1:3200${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('the API of the application\'s own data', () => {
  let cfg: AppConfig;
  beforeEach(() => { freshStore(); cfg = testConfig(); });
  const call = (pathname: string, init: Parameters<typeof request>[1] = {}) => route(request(pathname, init), cfg);

  it('serves an app module without any session or cookie', async () => {
    const view = await call('/api/modules/sample-deals');
    expect(view.status).toBe(200);
    expect(view.headers.get('set-cookie')).toBeNull();
    const page = await call('/api/modules/sample-deals/deals/query', { method: 'POST', body: { page: 1, pageSize: 50 } });
    expect(page.status).toBe(200);
    expect((await page.json()).rows.length).toBeGreaterThan(0);
  });
  it('answers 404 for every module that is not the application\'s own data', async () => {
    for (const id of ['timebuckets', 'sample-monthly', 'sample-liquidity']) {
      const r = await call(`/api/modules/${id}`);
      expect(r.status, id).toBe(404);
      expect((await r.json()).error.message, id).toBe(NOT_KEPT);
    }
    const report = await call('/api/modules/sample-liquidity/report', { method: 'POST', body: { selection: {} } });
    expect(report.status).toBe(404);
  });
  it('keeps the saved layouts of a module with a source, and refuses those of a module still on sample data', async () => {
    const body = { name: 'Mine', description: '', scope: 'personal', isDefault: false, layout: { columns: ['deal', 'name'], sort: [], subtotals: [], unit: null, subtotalsOnly: false, pageSize: 50 } };
    const saved = await call('/api/modules/sample-deals/layouts', { method: 'PUT', body, user: 'tester' });
    expect(saved.status).toBe(200);
    expect((await saved.json()).layouts).toMatchObject([{ name: 'Mine', changedBy: 'TESTER' }]);
    // Personal layouts belong to the acting user: another user does not see them.
    expect((await (await call('/api/modules/sample-deals/layouts', { user: 'other' })).json()).layouts).toEqual([]);
    expect((await (await call('/api/modules/sample-deals/layouts', { user: 'Tester' })).json()).layouts).toHaveLength(1);
    expect((await call('/api/modules/sample-cashflow/layouts')).status).toBe(404);
  });
  it('requires the app header and a listed origin on writes (403)', async () => {
    const query = { page: 1, pageSize: 50 };
    expect((await call('/api/modules/sample-deals/deals/query', { method: 'POST', body: query, appHeader: false })).status).toBe(403);
    expect((await call('/api/modules/sample-deals/deals/query', { method: 'POST', body: query, origin: null })).status).toBe(403);
    expect((await call('/api/modules/sample-deals/deals/query', { method: 'POST', body: query, origin: 'http://evil.example' })).status).toBe(403);
  });
  it('has no session, workspace or SAP check routes', async () => {
    expect((await call('/api/session', { method: 'POST', body: { username: 'demo', password: 'x' } })).status).toBe(404);
    expect((await call('/api/session', { method: 'DELETE' })).status).toBe(404);
    expect((await call('/api/workspace')).status).toBe(404);
    expect((await call('/api/sap/check/timebuckets', { method: 'POST' })).status).toBe(404);
  });
});
