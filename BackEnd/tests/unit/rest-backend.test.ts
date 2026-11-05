// The REST backend (source `rest`): the Deals sample kept in a fake REST data service that speaks the SLC middleware's
// protocol (GET data/<resource>?COL=…&COL[in]=…&limit&offset → { rows }, POST { data }, PATCH { key, changes },
// DELETE { key }), with the object service on top so the ETag check and the planner run as for `app` modules.
import { describe, expect, it } from 'vitest';
import type { Actor } from '@core/actor';
import { objectSpec } from '@core/server/object-service';
import { HttpError } from '@/lib/errors';
import type { Row } from '@/lib/grid/types';
import { SERVER_MODULES, type ModuleData } from '@/modules/server-registry';
import { contractOf } from '@/modules/tables';
import type { AnyObjectDef, RestContract } from '@/modules/types';
import { REST_PAGE, restBackend, restEndpoint } from '../../src/rest/rest-backend';

const actor: Actor = { id: 'u1', username: 'tester', sap: null };
const deals = SERVER_MODULES['sample-deals'];

const REST: RestContract = {
  service: 'test-mw',
  tables: {
    deals: {
      resource: 'deal', assigned: 'deal', numbers: ['amount', 'rate'],
      columns: { deal: 'ZDEAL', name: 'ZNAME', product: 'ZPROD', counterparty: 'ZCP', amount: 'ZAMT', currency: 'ZCURR', start: 'ZSTART', end: 'ZEND', rate: 'ZRATE', remarks: 'ZREM', status: 'ZSTAT' },
      stamps: { createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE' }
    },
    flows: { resource: 'dealFlow', numbers: ['amount'], columns: { deal: 'ZDEAL', seq: 'ZSEQ', payDate: 'ZPAY_DATE', flowType: 'ZTYPE', amount: 'ZAMT', currency: 'ZCURR' } }
  }
};
const KEYS: Record<string, string[]> = { deal: ['ZDEAL'], dealFlow: ['ZDEAL', 'ZSEQ'], product: ['ZPROD'] };

/** An in-memory REST data service with the middleware's protocol; `calls` records every request. */
function fakeService(initial: Record<string, Record<string, unknown>[]>) {
  const data = structuredClone(initial);
  const calls: { method: string; resource: string; query: URLSearchParams; body?: Record<string, unknown> }[] = [];
  let next = 7000;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const same = (row: Record<string, unknown>, key: Record<string, unknown>) => Object.entries(key).every(([c, v]) => String(row[c]) === String(v));
  const handler: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const resource = decodeURIComponent(url.pathname.split('/data/')[1]);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, resource, query: url.searchParams, body });
    const rows = (data[resource] ??= []);
    if (method === 'GET') {
      let out = rows;
      for (const [k, v] of url.searchParams) {
        if (['limit', 'offset', 'sort'].includes(k)) continue;
        const inList = /^(.*)\[in\]$/.exec(k);
        out = inList ? out.filter(r => v.split(',').includes(String(r[inList[1]]))) : out.filter(r => String(r[k]) === v);
      }
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? REST_PAGE);
      return json(200, { ok: true, rows: out.slice(offset, offset + limit) });
    }
    if (method === 'POST') {
      const row = { ...(body?.data as Record<string, unknown>) };
      if (!row.ZDEAL && resource === 'deal') row.ZDEAL = String(next++);
      const key = Object.fromEntries(KEYS[resource].map(c => [c, row[c]]));
      if (rows.some(r => same(r, key))) return json(409, { ok: false, error: { message: 'Duplicate key' } });
      rows.push(row);
      return json(201, { ok: true, key, assignedNumber: resource === 'deal' ? row.ZDEAL : undefined });
    }
    const key = body?.key as Record<string, unknown>;
    const at = rows.findIndex(r => same(r, key));
    if (at < 0) return json(404, { ok: false, error: { message: 'Row not found' } });
    if (method === 'PATCH') rows[at] = { ...rows[at], ...(body?.changes as Record<string, unknown>) };
    else rows.splice(at, 1);
    return json(200, { ok: true, affectedRows: 1 });
  };
  return { data, calls, handler };
}

const START: Record<string, Record<string, unknown>[]> = {
  deal: [{ ZDEAL: '0000010001', ZNAME: 'Term loan', ZPROD: '51A', ZCP: 'CP001', ZAMT: '250000.00', ZCURR: 'INR', ZSTART: '2026-01-01', ZEND: '2030-01-01', ZRATE: '7.2500', ZREM: null, ZSTAT: 'N' }],
  dealFlow: [{ ZDEAL: '0000010001', ZSEQ: 1, ZPAY_DATE: '2027-01-01', ZTYPE: 'INT', ZAMT: '18000.00', ZCURR: 'INR' }]
};

function setup(initial = START) {
  const service = fakeService(initial);
  const entry: ModuleData = { ...deals, source: 'rest', rest: REST };
  const backend = restBackend('sample-deals', entry, { key: 'test-mw', title: 'Test middleware', base: 'https://mw.example/api/v1', headers: {}, fetch: service.handler });
  const spec = objectSpec(entry.def as AnyObjectDef, contractOf(entry));
  return { service, entry, backend, spec };
}

describe('the REST backend', () => {
  it('reads a record with its items, columns mapped to fields, nulls as blank, with a content ETag', async () => {
    const { backend, spec } = setup();
    const stored = await backend.readObject(actor, spec, { deal: '0000010001' });
    expect(stored?.header).toMatchObject({ deal: '0000010001', name: 'Term loan', amount: '250000.00', remarks: '', status: 'N' });
    expect(stored?.header.__etag).toMatch(/^W\/"rest-[0-9a-f]{20}"$/);
    expect(stored?.items.flows).toEqual([expect.objectContaining({ seq: '1', payDate: '2027-01-01', amount: '18000.00' })]);
    expect(await backend.readObject(actor, spec, { deal: '9999' })).toBeNull();
  });

  it('creates with the number the service assigns, numbers as JSON numbers, and the create stamps', async () => {
    const { backend, spec, service } = setup();
    const key = await backend.writeObject(actor, spec, {
      op: 'create', key: { deal: '' },
      header: { name: 'New deal', product: '51A', counterparty: 'CP002', amount: '1000.50', currency: 'INR', start: '2026-02-01', end: '2027-02-01', rate: '6.5', remarks: '', status: 'N' },
      items: [{ tab: 'flows', op: 'create', key: { seq: '1' }, data: { payDate: '2026-08-01', flowType: 'INT', amount: '30', currency: 'INR' } }]
    });
    expect(key).toEqual({ deal: '7000' });
    const post = service.calls.find(c => c.method === 'POST' && c.resource === 'deal');
    expect(post?.body?.data).toMatchObject({ ZNAME: 'New deal', ZAMT: 1000.5, ZRATE: 6.5, ZCREATED_BY: 'TESTER' });
    expect(post?.body?.data).not.toHaveProperty('ZDEAL');
    expect(service.data.dealFlow).toContainEqual(expect.objectContaining({ ZDEAL: '7000', ZSEQ: '1', ZAMT: 30 }));
  });

  it('updates only the changed columns by key, with the change stamps, and the ETag follows the content', async () => {
    const { backend, spec, service } = setup();
    const before = await backend.readObject(actor, spec, { deal: '0000010001' });
    await backend.writeObject(actor, spec, { op: 'update', key: { deal: '0000010001' }, header: { remarks: 'Repriced' }, items: [] });
    const patch = service.calls.find(c => c.method === 'PATCH');
    expect(patch?.body).toEqual({ key: { ZDEAL: '0000010001' }, changes: expect.objectContaining({ ZREM: 'Repriced', ZCHANGED_BY: 'TESTER' }) });
    expect(Object.keys(patch?.body?.changes as object)).not.toContain('ZNAME');
    const after = await backend.readObject(actor, spec, { deal: '0000010001' });
    expect(after?.header.__etag).not.toBe(before?.header.__etag);
  });

  it('gives a record changed by someone else a new ETag, so the object service refuses the stale save (409)', async () => {
    const { backend, spec, service } = setup();
    const seen = await backend.readObject(actor, spec, { deal: '0000010001' });
    (service.data.deal[0] as Row).ZREM = 'changed by someone else';
    const now = await backend.readObject(actor, spec, { deal: '0000010001' });
    expect(now?.header.__etag).not.toBe(seen?.header.__etag);
  });

  it('deletes the items, then the record', async () => {
    const { backend, spec, service } = setup();
    await backend.writeObject(actor, spec, { op: 'delete', key: { deal: '0000010001' }, header: {}, items: [] });
    expect(service.calls.filter(c => c.method === 'DELETE').map(c => c.resource)).toEqual(['dealFlow', 'deal']);
    expect(service.data.deal).toEqual([]);
  });

  it('pages long reads and reads several keys with [in]', async () => {
    const many = Array.from({ length: REST_PAGE + 20 }, (_, i) => ({ ...START.deal[0], ZDEAL: String(20000 + i) }));
    const { backend, service } = setup({ deal: many, dealFlow: [] });
    const state = await backend.load(actor);
    expect(state.tables.deals).toHaveLength(REST_PAGE + 20);
    const rows = await backend.readKeys(actor, 'deals', [{ deal: '20000' }, { deal: '20519' }, { deal: 'nope' }]);
    expect(rows.map(r => r.deal)).toEqual(['20000', '20519']);
    expect(service.calls.at(-1)?.query.get('ZDEAL[in]')).toBe('20000,20519,nope');
  });

  it("turns the service's refusals into the template's statuses, with its message", async () => {
    const { backend, spec } = setup();
    const create = () => backend.writeObject(actor, spec, { op: 'create', key: { deal: '0000010001' }, header: { name: 'Twice' }, items: [] });
    await expect(create()).rejects.toMatchObject({ status: 409, message: 'Test middleware: Duplicate key' });
    const down = restBackend('sample-deals', { ...deals, source: 'rest', rest: REST }, { key: 'test-mw', title: 'Test middleware', base: 'https://mw.example', headers: {}, fetch: async () => { throw new TypeError('fetch failed'); } });
    await expect(down.load(actor)).rejects.toMatchObject({ status: 502, message: 'Cannot reach Test middleware. Check the connection and try again.' });
  });

  it('reads the lookups from the service, and works out derived columns on create and on change', async () => {
    const service = fakeService({ ...START, product: [{ ZPROD: '51A', ZTEXT: 'Term Loan', ZOTHER: 'x' }, { ZPROD: '53A', ZTEXT: 'Bond' }] });
    const rest: RestContract = {
      ...REST,
      lookups: { products: { resource: 'product', columns: { value: 'ZPROD', label: 'ZTEXT' } } },
      tables: {
        ...REST.tables,
        deals: {
          ...REST.tables.deals,
          columns: { ...REST.tables.deals.columns, productText: 'ZPROD_TEXT' },
          derive: (row, lk) => ({ productText: lk.products?.find(p => p.value === row.product)?.label ?? '' })
        }
      }
    };
    const backend = restBackend('sample-deals', { ...deals, source: 'rest', rest }, { key: 'test-mw', title: 'Test', base: 'https://mw.example/api/v1', headers: {}, fetch: service.handler });
    const spec = objectSpec(deals.def as AnyObjectDef, contractOf(deals));
    expect(await backend.lookups(actor)).toEqual({ products: [{ value: '51A', label: 'Term Loan' }, { value: '53A', label: 'Bond' }] });
    const key = await backend.writeObject(actor, spec, { op: 'create', key: { deal: '' }, header: { name: 'Derived', product: '51A', amount: '1' }, items: [] });
    expect(service.data.deal.find(r => r.ZDEAL === key.deal)).toMatchObject({ ZPROD_TEXT: 'Term Loan' });
    await backend.writeObject(actor, spec, { op: 'update', key, header: { product: '53A' }, items: [] });
    expect(service.calls.filter(c => c.method === 'PATCH').at(-1)?.body?.changes).toMatchObject({ ZPROD: '53A', ZPROD_TEXT: 'Bond' });
  });

  it('finds the base URL in rest-services.json or REST_<KEY>_URL, and says which is missing', () => {
    const header = ['Token', 'for', 'tests'].join('-');   // any value: it is sent as the Authorization header as it is
    expect(restEndpoint(REST, { REST_TEST_MW_URL: 'https://mw.example/api/v1/', REST_TEST_MW_AUTHORIZATION: header }))
      .toMatchObject({ base: 'https://mw.example/api/v1', headers: { authorization: header } });
    expect(() => restEndpoint(REST, {})).toThrowError(new HttpError(503, 'The REST data service test-mw has no URL: list it in src/config/rest-services.json or set REST_TEST_MW_URL.'));
  });
});
