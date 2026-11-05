// The reference screens' API (/api/ref/middleware and /api/ref/localdb): the middleware passed through with a fake fetch,
// the cloud-table routes over a fake middleware that speaks its data/<resource> protocol, and the BackEnd's own table
// (tsf-fx-post-doc) on the in-memory database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server';
import { freshStore, testConfig } from '../support/config';

const FRONTEND = 'http://localhost:3100';
const BASE = 'https://mw.example/api/v1';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Call { method: string; url: URL; body?: unknown; headers: Headers }

/** A fake middleware: records every call and answers with `answer`. */
function recorder(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFake: typeof fetch = async (input, init) => {
    const call: Call = { method: init?.method ?? 'GET', url: new URL(String(input)), body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) };
    calls.push(call);
    return answer(call);
  };
  return { calls, fetch: fetchFake };
}

/** The middleware's data/<resource> protocol in memory (GET with column filters, POST { data }, PATCH { key, changes }, DELETE { key }). */
function dataService(keys: Record<string, string[]>, initial: Record<string, Record<string, unknown>[]> = {}) {
  const data = structuredClone(initial);
  return recorder(call => {
    const resource = call.url.pathname.split('/data/')[1];
    const rows = (data[resource] ??= []);
    const same = (row: Record<string, unknown>, key: Record<string, unknown>) => Object.entries(key).every(([c, v]) => String(row[c]) === String(v));
    if (call.method === 'GET') {
      let out = rows;
      for (const [k, v] of call.url.searchParams) if (!['limit', 'offset', 'sort'].includes(k)) out = out.filter(r => String(r[k]) === v);
      const offset = Number(call.url.searchParams.get('offset') ?? 0);
      return json(200, { ok: true, rows: out.slice(offset, offset + Number(call.url.searchParams.get('limit') ?? 500)) });
    }
    const body = call.body as { data?: Record<string, unknown>; key?: Record<string, unknown>; changes?: Record<string, unknown> };
    if (call.method === 'POST') {
      if (rows.some(r => keys[resource].every(k => r[k] === body.data![k]))) return json(409, { ok: false, error: { message: 'duplicate' } });
      rows.push({ ...body.data }); return json(201, { ok: true, affectedRows: 1 });
    }
    const row = rows.find(r => same(r, body.key!));
    if (!row) return json(404, { ok: false, error: { message: 'no row' } });
    if (call.method === 'PATCH') { Object.assign(row, body.changes); return json(200, { ok: true, affectedRows: 1 }); }
    rows.splice(rows.indexOf(row), 1); return json(200, { ok: true, affectedRows: 1 });
  });
}

describe('/api/ref', () => {
  let app: FastifyInstance;
  let mw = recorder(() => json(200, {}));
  beforeAll(async () => {
    freshStore();
    // The service is always the one `mw` holds now (each test sets it).
    app = buildServer(testConfig(), { fetch: (input, init) => mw.fetch(input, init), env: { REST_SLC_MIDDLEWARE_URL: BASE } });
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => app.inject({
    method: method as 'GET', url,
    headers: { origin: FRONTEND, 'x-app-request': '1', 'x-app-user': 'karthik', ...(payload === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    payload: payload === undefined ? undefined : JSON.stringify(payload)
  });

  describe('middleware pass-through', () => {
    it('forwards method, path, query and body, and returns the answer unchanged', async () => {
      mw = recorder(() => json(201, { ok: true, rows: [{ a: 1 }] }));
      const res = await call('POST', '/api/ref/middleware/data/comp?limit=2&x=a%20b', { data: { ZA: 'x' } });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ok: true, rows: [{ a: 1 }] });
      expect(mw.calls).toHaveLength(1);
      expect(mw.calls[0].method).toBe('POST');
      expect(mw.calls[0].url.href).toBe(`${BASE}/data/comp?limit=2&x=a%20b`);
      expect(mw.calls[0].body).toEqual({ data: { ZA: 'x' } });
      expect(mw.calls[0].headers.get('content-type')).toBe('application/json');
    });

    it('reads without the write header', async () => {
      mw = recorder(() => json(200, { rows: [] }));
      const res = await app.inject({ method: 'GET', url: '/api/ref/middleware/data/comp?limit=2', headers: { origin: FRONTEND } });
      expect(res.statusCode).toBe(200);
      expect(mw.calls[0].url.href).toBe(`${BASE}/data/comp?limit=2`);
    });

    it('passes an error answer from the middleware through', async () => {
      mw = recorder(() => json(422, { ok: false, error: { message: 'bad column' } }));
      const res = await call('GET', '/api/ref/middleware/data/comp');
      expect(res.statusCode).toBe(422);
      expect(res.json()).toEqual({ ok: false, error: { message: 'bad column' } });
    });

    it('answers 502 with a clear message when the middleware cannot be reached', async () => {
      mw = recorder(() => { throw new TypeError('fetch failed'); });
      const res = await call('GET', '/api/ref/middleware/data/comp');
      expect(res.statusCode).toBe(502);
      expect(res.json().error.message.value).toMatch(/Cannot reach the SLC middleware/);
    });

    it('refuses a write without x-app-request or from an unlisted origin, and never calls the middleware', async () => {
      mw = recorder(() => json(200, {}));
      expect((await call('POST', '/api/ref/middleware/data/comp', { data: {} }, { 'x-app-request': '0' })).statusCode).toBe(403);
      expect((await call('DELETE', '/api/ref/middleware/data/comp', { key: {} }, { origin: 'http://evil.example' })).statusCode).toBe(403);
      const res = await app.inject({ method: 'PATCH', url: '/api/ref/middleware/data/comp', headers: { origin: FRONTEND, 'content-type': 'application/json' }, payload: '{}' });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.message.value).toBe('Untrusted request origin.');
      expect(mw.calls).toHaveLength(0);
    });

    it('never forwards an encoded dot-dot path out of the service', async () => {
      mw = recorder(() => json(200, {}));
      expect((await call('GET', '/api/ref/middleware/%2e%2e/admin')).statusCode).toBeGreaterThanOrEqual(400);
      expect(mw.calls).toHaveLength(0);
    });

    it('leaves the core routes alone', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/ref/nothing', headers: { origin: FRONTEND } })).statusCode).toBe(404);
    });
  });

  describe('localdb over the middleware cloud tables', () => {
    it('trade position: create (201, stamped), read, update (200), filter, delete (204), then 404', async () => {
      mw = dataService({ trdPos: ['zdeal_id', 'zseq'] });
      const url = '/api/ref/localdb/tsf-trade-position/D1000/01';
      const created = await call('PUT', url, { ZAMT: 12.5, ZCURR: 'USD', ZCREATED_BY: 'FAKE' });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ ZDEAL_ID: 'D1000', ZSEQ: '01', ZAMT: 12.5, ZCURR: 'USD', ZCREATED_BY: 'KARTHIK', ZCHANGED_BY: 'KARTHIK' });
      expect(created.json().ZCREATED_DATE).toMatch(/^\d{8}$/);
      const post = mw.calls.find(c => c.method === 'POST')!;
      expect(post.body).toMatchObject({ data: { zdeal_id: 'D1000', zseq: '01', zamt: 12.5, zcreated_by: 'KARTHIK' } });
      expect((post.body as { data: Record<string, string> }).data.zcreated_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect((await call('GET', url)).json()).toMatchObject({ ZDEAL_ID: 'D1000', ZAMT: 12.5 });
      const updated = await call('PUT', url, { ZSET_CHECK: 'X' });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ ZSET_CHECK: 'X', ZAMT: 12.5 });

      await call('PUT', '/api/ref/localdb/tsf-trade-position/D2000/01', { ZAMT: 1 });
      expect((await call('GET', '/api/ref/localdb/tsf-trade-position')).json().value).toHaveLength(2);
      const one = (await call('GET', '/api/ref/localdb/tsf-trade-position?ZDEAL_ID=D2000')).json().value;
      expect(one).toHaveLength(1);
      expect(one[0].ZDEAL_ID).toBe('D2000');

      expect((await call('DELETE', url)).statusCode).toBe(204);
      const gone = await call('GET', url);
      expect(gone.statusCode).toBe(404);
      expect(gone.json().error.message.value).toBe('No trade position for this Deal ID and sequence.');
      expect((await call('DELETE', url)).statusCode).toBe(404);
    });

    it('rejects bad input with 400 and unknown routes or methods with 404', async () => {
      mw = dataService({ trdPos: ['zdeal_id', 'zseq'] });
      expect((await call('PUT', '/api/ref/localdb/tsf-trade-position/D1/01', { NOPE: 'x' })).statusCode).toBe(400);
      expect((await call('PUT', '/api/ref/localdb/tsf-trade-position/D1/01', { ZAMT: 'abc' })).statusCode).toBe(400);
      expect((await call('PUT', '/api/ref/localdb/tsf-trade-position/D1/001', { ZAMT: 1 })).statusCode).toBe(400);
      expect((await call('PUT', '/api/ref/localdb/tsf-trade-position/D1/01', undefined)).statusCode).toBe(400);
      expect((await call('GET', '/api/ref/localdb/tsf-trade-position?ZDEAL_ID=a&ZDEAL_ID=b')).statusCode).toBe(400);
      expect((await call('GET', '/api/ref/localdb/unknown')).statusCode).toBe(404);
      expect((await call('POST', '/api/ref/localdb/tsf-trade-position', {})).statusCode).toBe(404);
      expect((await call('DELETE', '/api/ref/localdb/tsf-limit/2026/USDINR/20260101/20261231')).statusCode).toBe(404);
    });

    it('deal document speaks ISO dates and times, stored as DATS / TIMS', async () => {
      mw = dataService({ tsfDealdms: ['zdeal_id', 'zdms_cat', 'zdms_type'] });
      const res = await call('PUT', '/api/ref/localdb/tsf-deal-document/D1000/10/D01', { ZDDATE: '2026-03-05', ZDMS_CODE: 'C1' });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ ZDDATE: '2026-03-05', ZDMS_CODE: 'C1', ZCREATED_BY: 'KARTHIK' });
      expect(res.json().ZCREATED_TIME).toMatch(/^\d\d:\d\d:\d\d$/);
      const list = await call('GET', '/api/ref/localdb/tsf-deal-document?ZDEAL_ID=D1000&ZDMS_CAT=10');
      expect(list.json().value).toHaveLength(1);
      expect((await call('GET', '/api/ref/localdb/tsf-deal-document?ZDEAL_ID=D1000&ZDMS_CAT=20')).json().value).toHaveLength(0);
      expect((await call('PUT', '/api/ref/localdb/tsf-deal-document/D1000/10/D01', { ZDDATE: '05/03/2026' })).statusCode).toBe(400);
    });

    it('day lock locks a real day only, with upper-case columns and the program constants', async () => {
      mw = dataService({ daylock: ['ZCO_AREA', 'ZMONTH', 'ZYEAR', 'ZTYPE', 'ZB_TYPE', 'ZPDATE', 'ZGRP'] });
      const url = '/api/ref/localdb/tsf-day-lock/20260305/G1/TRADER1';
      const locked = await call('PUT', url);
      expect(locked.statusCode).toBe(201);
      expect(locked.json()).toMatchObject({ ZLOCKED: 'X', ZB_TYPE: 'DE6', ZCO_AREA: 'OL10', ZMONTH: '3', ZYEAR: '2026' });
      expect((await call('PUT', url)).statusCode).toBe(200);
      expect((await call('GET', '/api/ref/localdb/tsf-day-lock?ZTYPE=TRADER1')).json().value).toHaveLength(1);
      expect((await call('PUT', '/api/ref/localdb/tsf-day-lock/20260231/G1/TRADER1')).statusCode).toBe(400);
      expect((await call('DELETE', url)).statusCode).toBe(204);
    });

    it('limit validates its key; lists of currency pairs and field names read through', async () => {
      mw = dataService({ limMan: ['zyear', 'zcurr_pair', 'zlimit_startdt', 'zlimit_matdt'] }, { curpair: [{ f_curr: 'USD', t_curr: 'INR', bukrs: '1000', pair: 'USDINR', div_ratio: '1' }], fields: [{ zfield: 'F1', zname: 'Field one' }] });
      expect((await call('PUT', '/api/ref/localdb/tsf-limit/2026/USDINR/20261231/20260101', { ZINI_AAMT: 5 })).statusCode).toBe(400);
      const saved = await call('PUT', '/api/ref/localdb/tsf-limit/2026/USDINR/20260101/20261231', { ZINI_AAMT: 5 });
      expect(saved.statusCode).toBe(201);
      expect(saved.json()).toMatchObject({ ZYEAR: '2026', ZINI_AAMT: 5 });
      expect((await call('GET', '/api/ref/localdb/tsf-limit?ZYEAR=2026')).json().value).toHaveLength(1);
      expect((await call('GET', '/api/ref/localdb/tsf-currency-pair')).json().value[0]).toMatchObject({ F_CURR: 'USD', PAIR: 'USDINR', DIV_RATIO: 1 });
      expect((await call('GET', '/api/ref/localdb/tsf-field-name')).json().value).toEqual([expect.objectContaining({ ZFIELD: 'F1', ZNAME: 'Field one' })]);
    });

    it('passes a middleware failure through with its status in the gateway error shape', async () => {
      mw = recorder(() => json(500, { ok: false, error: { message: 'db down' } }));
      const res = await call('GET', '/api/ref/localdb/tsf-posting-type');
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: { message: { value: 'db down' } } });
      mw = recorder(() => { throw new TypeError('fetch failed'); });
      expect((await call('GET', '/api/ref/localdb/tsf-dms-type')).statusCode).toBe(502);
    });
  });

  describe('localdb over the BackEnd database (tsf-fx-post-doc)', () => {
    const url = '/api/ref/localdb/tsf-fx-post-doc/1000/FX00000000001';
    it('creates, reads, updates and keeps the first created stamp; has no delete or list', async () => {
      mw = recorder(() => json(500, {}));
      expect((await call('GET', url)).statusCode).toBe(404);
      const created = await call('PUT', url, { ZDOC1: '100001', ZGJAHR1: '2026', ZMSG: 'posted' });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ ZBUKRS: '1000', ZRFHA: 'FX00000000001', ZDOC1: '100001', ZDOC2: '', ZMSG: 'posted', ZCREATED_BY: 'KARTHIK' });
      expect((await call('GET', url)).json()).toEqual(created.json());
      const updated = await call('PUT', url, { ZDOC2: '100002', ZGJAHR2: '2026' }, { 'x-app-user': 'other' });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ ZDOC1: '100001', ZDOC2: '100002', ZCREATED_BY: 'KARTHIK', ZCHANGED_BY: 'OTHER' });
      expect((await call('DELETE', url)).statusCode).toBe(404);
      expect((await call('GET', '/api/ref/localdb/tsf-fx-post-doc')).statusCode).toBe(404);
      expect((await call('PUT', url, { ZDOC1: 'x'.repeat(11) })).statusCode).toBe(400);
      expect((await call('PUT', '/api/ref/localdb/tsf-fx-post-doc/10000/F', { ZDOC1: '1' })).statusCode).toBe(400);
      expect(mw.calls).toHaveLength(0);
    });
  });
});
