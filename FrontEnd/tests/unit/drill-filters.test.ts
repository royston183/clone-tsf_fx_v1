// tests/integration/drill-filters.test.ts
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parseDrillParams } from '@/lib/drill/params';
import { filterOp, filtersOf } from '@/lib/list/pagination';
import type { ListQuery } from '@/lib/list/types';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { moduleService } from '@core/server/module-service';
import { contract } from '@/modules/samples/deals/contract';
import { deals } from '@/modules/samples/deals/definition';
import { dealsSeed } from '@/modules/samples/deals/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';

installTestPlatform();

// The Deals list with the deal name as an extra (contains) filter, as an application may declare it.
const list = { ...deals.list, filters: [...(deals.list.filters ?? []), 'name'] };
const filterFields = list.fields.filter(d => list.filters.includes(d.field));

/** What the Deals screen does with a drill URL: parse f.*, then start the filter bar with the valid values. */
function drilled(search: string): { dropped: string[]; query: ListQuery } {
  const { values, dropped } = parseDrillParams(new URLSearchParams(search), 'f', filterFields, deals.lookups(undefined));
  const initial = Object.fromEntries(Object.entries(values).map(([f, v]) => {
    const d = filterFields.find(x => x.field === f);
    return [f, d && filterOp(d) === 'between' ? [v, v] : [v]];
  }));
  return { dropped, query: { filters: filtersOf(list, initial), page: 1, pageSize: 50 } };
}
const sapSets = (): Record<string, MockSet> => ({
  Deal: {
    key: 'Deal',
    rows: dealsSeed(200).tables.deals.map(r => ({ Deal: r.deal, Name: r.name, Product: r.product, Counterparty: r.counterparty, Amount: Number(r.amount), Currency: r.currency, Start: r.start, End: r.end, Rate: Number(r.rate), Remarks: r.remarks, Status: r.status }))
  },
  DealFlow: { key: 'Deal', keys: ['Deal', 'Seq'], rows: [] }
});

beforeAll(() => { SERVER_MODULES['test-deals-drill'] = { def: { ...deals, id: 'test-deals-drill', list }, contract, seed: () => dealsSeed(200), source: 'sap' }; });

describe('drill filters on a large list (mock store)', () => {
  onSampleData('test-deals-drill');
  let cfg: AppConfig;
  beforeEach(async () => { cfg = freshConfig(); });

  it('drops f.* filters that are not declared filters or not valid values; the valid ones filter the list', async () => {
    const { dropped, query } = drilled('f.product=52A&f.currency=XYZ&f.remarks=x&f.status=N&f.amount=1e9)%20or%20(1%20eq%201');
    expect(dropped).toEqual(['currency', 'remarks', 'amount']);
    expect(query.filters).toEqual([{ field: 'product', op: 'eq', values: ['52A'] }, { field: 'status', op: 'eq', values: ['N'] }]);
    const page = await moduleService(cfg, 'test-deals-drill').query(actingAs(), 'deals', query);
    expect(page.total).toBeGreaterThan(0);
    expect(page.rows.every(r => r.product === '52A' && r.status === 'N')).toBe(true);
  });
  it('drops a choice filter whose option list is empty (lookups not in): nothing passes unchecked', () => {
    const none = { products: [], counterparties: [], currencies: [] };
    const fields = [...filterFields, ...deals.list.fields.filter(d => d.field === 'counterparty')];
    const { values, dropped } = parseDrillParams(new URLSearchParams('f.product=ANY&f.currency=ANY&f.counterparty=ANY&f.status=N'), 'f', fields, none);
    expect(values).toEqual({ status: 'N' });
    expect(dropped).toEqual(['product', 'currency', 'counterparty']);
  });
});

describe('drill filters on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeEach(async () => {
    sap = await startMockSap({ sets: sapSets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it("a drill filter with a quote is escaped and finds O'Brien", async () => {
    const { dropped, query } = drilled(`f.name=${encodeURIComponent("O'Brien")}`);
    expect(dropped).toEqual([]);
    expect(query.filters).toEqual([{ field: 'name', op: 'contains', values: ["O'Brien"] }]);
    const page = await moduleService(cfg, 'test-deals-drill').query(user, 'deals', query);
    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every(r => r.name.includes("O'Brien"))).toBe(true);
    expect(sap.log.find(r => r.method === 'GET' && r.rel === 'Deal')?.query.get('$filter')).toBe("contains(Name,'O''Brien')");
  });
  it('never sends an invalid or undeclared drill filter', async () => {
    const { query } = drilled('f.amount=1e9)%20or%20(1%20eq%201&f.remarks=x&f.__proto__=y');
    await moduleService(cfg, 'test-deals-drill').query(user, 'deals', query);
    expect(sap.log.find(r => r.method === 'GET' && r.rel === 'Deal')?.query.get('$filter')).toBeNull();
  });
});
