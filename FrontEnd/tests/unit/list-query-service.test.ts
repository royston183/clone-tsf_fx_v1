// tests/integration/list-query.test.ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import type { ListDef } from '@/lib/list/types';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { moduleQuery } from '@core/server/handlers';
import { handle } from '@core/server/http';
import { moduleService } from '@core/server/module-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { ObjectModuleDef, ODataContract } from '@/modules/types';
import { actingAs, freshConfig, installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockRow, type MockSap } from '../support/mock-sap';

installTestPlatform();


const LIST: ListDef<unknown> = {
  entity: 'deals', keys: ['deal'], columns: [],
  fields: [
    { field: 'deal', label: 'Deal', type: 'code', max: 10 },
    { field: 'name', label: 'Name', type: 'text', max: 40 },
    { field: 'type', label: 'Type', type: 'select', options: [{ value: '01', label: 'Loan' }, { value: '02', label: 'Deposit' }] },
    { field: 'amount', label: 'Amount', type: 'amount' },
    { field: 'start', label: 'Start', type: 'date' },
    { field: 'term', label: 'Term', type: 'integer', max: 3 },
    { field: 'active', label: 'Active', type: 'flag' }
  ],
  search: ['deal', 'name'], filters: ['type', 'amount', 'start', 'term', 'active', 'name'], sort: ['amount', 'start', 'name', 'term'],
  defaultSort: { field: 'deal', dir: 1 }, pageSizes: [10, 50]
};
const NAMES = ["O'Brien Capital", 'Axis Finance', 'Bharat Steel', 'axis small'];
const ROWS: Row[] = Array.from({ length: 37 }, (_, i) => ({
  deal: `D${String(i + 1).padStart(3, '0')}`, name: NAMES[i % 4], type: i % 3 ? '01' : '02',
  amount: `${((i * 7919) % 50) * 100 + 50}.00`, start: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
  term: String(6 * ((i % 4) + 1)), active: i % 2 ? 'X' : ''
}));
const sapRow = (r: Row): MockRow => ({ Deal: r.deal, Name: r.name, Type: r.type, Amount: Number(r.amount), Start: r.start, Term: Number(r.term), Active: r.active === 'X' });
const def: ObjectModuleDef<unknown> = { kind: 'object', opens: { create: 'popup', open: 'popup' }, id: 'test-list', title: 'Test list', noun: ['Deal', 'Deals'], serviceKey: 'samples', storageKey: 'k', lookups: () => ({}), list: LIST, header: LIST.fields, tabs: [] };
const contract: ODataContract = { service: 'ZFS_SB_TEST_O4_API', naming: 'pascal', numbers: ['term'], flagType: 'boolean', tables: { deals: { entitySet: 'Deal' } } };

describe('large list queries', () => {
  let sap: MockSap;
  let odata: AppConfig;
  let local: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeAll(() => {
    SERVER_MODULES['test-list'] = { def, contract, seed: { tables: { deals: ROWS } }, source: 'sap' };
    SERVER_MODULES['test-list-store'] = { def, contract, seed: { tables: { deals: ROWS } } };
  });
  beforeEach(async () => {
    sap = await startMockSap({ sets: { Deal: { key: 'Deal', rows: ROWS.map(sapRow) } } });
    odata = relayConfig(sap);
    local = freshConfig();
  });
  afterEach(async () => { await sap.close(); });

  it('reads one page from SAP with $top, $skip, $count and a stable order', async () => {
    const page = await moduleService(odata, 'test-list').query(user, 'deals', { sort: { field: 'amount', dir: -1 }, page: 2, pageSize: 10 });
    expect(page).toMatchObject({ total: 37, page: 2, pageSize: 10 });
    expect(page.rows).toHaveLength(10);
    const get = sap.log.find(r => r.method === 'GET' && r.rel === 'Deal');
    expect(get?.query.get('$top')).toBe('10');
    expect(get?.query.get('$skip')).toBe('10');
    expect(get?.query.get('$count')).toBe('true');
    expect(get?.query.get('$orderby')).toBe('Amount desc,Deal asc');
    expect(get?.query.get('sap-client')).toBe('100');
    expect(page.rows[0].amount).toMatch(/^\d+\.00$/);
    expect(page.rows[0].active).toMatch(/^(X|)$/);
  });

  it.each([
    { search: "O'Brien" },
    { search: 'axis' },
    { filters: [{ field: 'type', op: 'in', values: ['01', '02'] }], sort: { field: 'name', dir: 1 } },
    { filters: [{ field: 'amount', op: 'between', values: ['1,000', '3000'] }], sort: { field: 'amount', dir: 1 } },
    { filters: [{ field: 'start', op: 'between', values: ['01-03-2026', ''] }, { field: 'active', op: 'eq', values: ['X'] }] },
    { filters: [{ field: 'term', op: 'eq', values: ['12'] }], sort: { field: 'term', dir: -1 } },
    { filters: [{ field: 'name', op: 'contains', values: ['Steel'] }] },
    { page: 4 }
  ])('pages, filters and sorts the mock store exactly like SAP: %j', async extra => {
    const raw = { page: 1, pageSize: 10, ...extra };
    const fromSap = await moduleService(odata, 'test-list').query(user, 'deals', raw);
    const fromStore = await moduleService(local, 'test-list-store').query(actingAs(), 'deals', raw);
    expect(fromSap.total).toBe(fromStore.total);
    expect(fromSap.rows.map(r => r.deal)).toEqual(fromStore.rows.map(r => r.deal));
  });

  it('finds a value with a quote and never puts it in the URL unescaped', async () => {
    const page = await moduleService(odata, 'test-list').query(user, 'deals', { search: "O'Brien", page: 1, pageSize: 50 });
    expect(page.total).toBe(10);
    const get = sap.log.find(r => r.method === 'GET' && r.rel === 'Deal');
    expect(get?.query.get('$filter')).toBe("(contains(Deal,'O''Brien') or contains(Name,'O''Brien'))");
  });

  it('refuses undeclared fields, unknown tables and tables that are not large', async () => {
    await expect(moduleService(local, 'test-list-store').query(actingAs(), 'deals', { page: 1, pageSize: 10, filters: [{ field: 'secret', op: 'eq', values: ['x'] }] })).rejects.toMatchObject({ status: 400 });
    await expect(moduleService(local, 'test-list-store').query(actingAs(), 'nope', { page: 1, pageSize: 10 })).rejects.toMatchObject({ status: 404 });
    await expect(moduleService(local, 'timebuckets').query(actingAs(), 'alm1', { page: 1, pageSize: 50 })).rejects.toMatchObject({ status: 404 });
  });

  it('applies the write guard to the query endpoint (POST)', async () => {
    const req = new Request('http://localhost:3100/api/modules/test-list/deals/query', { method: 'POST', headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' }, body: '{}' });
    expect((await handle(() => moduleQuery(req, local, 'test-list-store', 'deals'))).status).toBe(403);
  });

  it('reads stored rows by key in chunks of 40', async () => {
    const backendKeys = Array.from({ length: 45 }, (_, i) => ({ deal: `D${String(i + 1).padStart(3, '0')}` }));
    const svc = moduleService(odata, 'test-list');
    const found = await svc.readKeys(user, 'deals', backendKeys);
    expect(found.map(r => r.deal)).toEqual(ROWS.map(r => r.deal));
    const gets = sap.log.filter(r => r.method === 'GET' && r.rel === 'Deal');
    expect(gets).toHaveLength(2);
    expect(gets[0].query.get('$filter')).toMatch(/^\(Deal eq 'D001'\) or \(Deal eq 'D002'\)/);
  });
});
