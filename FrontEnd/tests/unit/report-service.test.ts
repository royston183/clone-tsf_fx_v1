import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { handle } from '@core/server/http';
import { backendFor } from '@core/server/module-service';
import { reportRequest, reportService } from '@core/server/report-service';
import { contract as cashflowContract } from '@/modules/samples/cashflow/contract';
import { cashflow } from '@/modules/samples/cashflow/definition';
import { cashflowSeed } from '@/modules/samples/cashflow/seed';
import { contract as liquidityContract } from '@/modules/samples/liquidity/contract';
import { liquidity } from '@/modules/samples/liquidity/definition';
import { liquiditySeed } from '@/modules/samples/liquidity/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { LineItemReport } from '@/lib/report/types';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';

installTestPlatform();

const SEL = { company: '1000', month: '01', year: '2026' };
const ORDER = ['A', 'A:01', 'A:01:01', 'A:01:02', 'A:02', 'A:02:01', 'AT', 'B', 'B:01', 'B:01:01', 'B:01:02', 'BT', 'C', 'D', 'E'];
const money = (v: string) => (v === '' ? null : Number(v));
const sapSets = (): Record<string, MockSet> => ({
  LiquidityRow: {
    key: 'Seq', keys: ['Company', 'Month', 'Year', 'Seq'],
    rows: liquiditySeed().tables.statement.map(r => ({
      Company: r.company, Month: r.month, Year: r.year, Seq: Number(r.seq), Id: r.id, Name: r.name, RowStyle: r.rowStyle, Split: r.split, Product: r.product,
      B1: money(r.b1), B2: money(r.b2), B3: money(r.b3), B4: money(r.b4), B5: money(r.b5), Total: money(r.total)
    }))
  }
});
const windowed: LineItemReport = { ...(cashflow.report as LineItemReport), window: { field: 'payDate', keyDate: 'keyDate', days: 'days' } };
const ranged: LineItemReport = { ...(cashflow.report as LineItemReport) };
const small: LineItemReport = { ...(cashflow.report as LineItemReport), maxRows: 5 };

beforeAll(() => {
  SERVER_MODULES['sample-liquidity'] = { def: liquidity, contract: liquidityContract, seed: liquiditySeed, source: 'sap' };
  SERVER_MODULES['sample-cashflow'] = { def: cashflow, contract: cashflowContract, seed: cashflowSeed, source: 'sap' };
  SERVER_MODULES['test-cashflow-window'] = {
    def: { ...cashflow, id: 'test-cashflow-window', report: windowed, selection: [...cashflow.selection, { field: 'keyDate', label: 'Key Date', type: 'date' as const }, { field: 'days', label: 'Days', type: 'integer' as const, max: 4 }] },
    contract: cashflowContract, seed: cashflowSeed, source: 'sap'
  };
  SERVER_MODULES['test-cashflow-range'] = {
    def: { ...cashflow, id: 'test-cashflow-range', report: ranged, selection: [...cashflow.selection, { field: 'payDate', label: 'Payment Date', type: 'dateRange' as const, toField: 'payDateTo' }] },
    contract: cashflowContract, seed: cashflowSeed, source: 'sap'
  };
  SERVER_MODULES['test-cashflow-small'] = { def: { ...cashflow, id: 'test-cashflow-small', report: small }, contract: cashflowContract, seed: cashflowSeed, source: 'sap' };
});

describe('reports on the mock store', () => {
  onSampleData('sample-liquidity', 'sample-cashflow', 'test-cashflow-small', 'test-cashflow-window', 'test-cashflow-range');
  let cfg: AppConfig;
  beforeEach(async () => { cfg = freshConfig(); });

  it('reads the rows of one selection in SAP order with the selection text', async () => {
    const out = await reportService(cfg, 'sample-liquidity').run(actingAs(), SEL);
    expect(out.rows.map(r => r.id)).toEqual(ORDER);
    expect(out.meta).toMatchObject({ selection: SEL, selectionText: '1000 - Demo India Ltd · 01-2026', total: 15 });
    const row = (id: string) => out.rows.find(r => r.id === id);
    expect(row('A:01:01')?.b1).toBe('1320000.00');
    expect(row('A')?.total).toBe('24600000.00');
    expect(row('C')?.total).toBe('-13230000.00');
    expect(row('E')).toMatchObject({ b1: '1.89', b3: '-17.54', total: '' });
  });
  it('refuses an invalid selection with field messages (400)', async () => {
    await expect(reportService(cfg, 'sample-liquidity').run(actingAs(), { company: '1000', month: '13', year: '2026' }))
      .rejects.toMatchObject({ status: 400, message: "Period '13' is not a valid option.", details: [{ field: 'month', message: "Period '13' is not a valid option." }] });
    await expect(reportService(cfg, 'sample-liquidity').run(actingAs(), { company: '9999', month: '01', year: '2026' }))
      .rejects.toMatchObject({ status: 400, message: "Company Code '9999' is not in the list." });
  });
  it('refuses more than maxRows rows (422) and never truncates', async () => {
    await expect(reportService(cfg, 'test-cashflow-small').run(actingAs(), SEL)).rejects.toMatchObject({ status: 422, message: 'Too many rows (more than 5). Narrow the selection.' });
  });
  it('reads only the rows inside the window (a between filter on a date field) and refuses a non-numeric days value', async () => {
    const svc = reportService(cfg, 'test-cashflow-window');
    const all = (await svc.run(actingAs(), SEL)).rows;
    const inside = (await svc.run(actingAs(), { ...SEL, keyDate: '2026-01-05', days: '10' })).rows;
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.length).toBeLessThan(all.length);
    expect(inside.every(r => r.payDate >= '2026-01-05' && r.payDate <= '2026-01-15')).toBe(true);
    expect(inside).toHaveLength(all.filter(r => r.payDate >= '2026-01-05' && r.payDate <= '2026-01-15').length);
    await expect(svc.run(actingAs(), { ...SEL, keyDate: '2026-01-05', days: 'abc' })).rejects.toMatchObject({ status: 400, details: [{ field: 'days' }] });
  });
  it('reads only the rows inside a two-field date range, and a range with only a from date', async () => {
    const svc = reportService(cfg, 'test-cashflow-range');
    const all = (await svc.run(actingAs(), SEL)).rows;
    const both = (await svc.run(actingAs(), { ...SEL, payDate: '2026-01-05', payDateTo: '2026-01-15' })).rows;
    expect(both.length).toBeGreaterThan(0);
    expect(both).toHaveLength(all.filter(r => r.payDate >= '2026-01-05' && r.payDate <= '2026-01-15').length);
    expect(both.length).toBeLessThan(all.length);
    const half = (await svc.run(actingAs(), { ...SEL, payDate: '2026-01-20' })).rows;
    expect(half).toHaveLength(all.filter(r => r.payDate >= '2026-01-20').length);
    expect(half.length).toBeGreaterThan(0);
    expect(half.length).toBeLessThan(all.length);
  });
  it('reads line items; an empty optional company reads both companies, two currencies each', async () => {
    const svc = reportService(cfg, 'sample-cashflow');
    const one = await svc.run(actingAs(), SEL);
    expect(one.rows).toHaveLength(20);
    expect(new Set(one.rows.map(r => r.currency))).toEqual(new Set(['INR', 'USD']));
    expect(one.rows[0].cpName).not.toBe('');
    expect((await svc.run(actingAs(), { month: '01', year: '2026' })).rows).toHaveLength(40);
  });
  it('reads the lookups once for several runs and breakdowns (the 60 s cache of module lists)', async () => {
    const lookups = vi.spyOn(backendFor('sample-liquidity', SERVER_MODULES['sample-liquidity']), 'lookups');
    const svc = reportService(cfg, 'sample-liquidity');
    await svc.run(actingAs(), SEL);
    await svc.run(actingAs(), { ...SEL, month: '12', year: '2025' });
    await svc.breakdown(actingAs(), { selection: SEL, rowId: 'A', column: 'b1' });
    expect(lookups).toHaveBeenCalledTimes(1);
    lookups.mockRestore();
  });
  it('breaks a row down into its direct children', async () => {
    const out = await reportService(cfg, 'sample-liquidity').breakdown(actingAs(), { selection: SEL, rowId: 'A', column: 'b1' });
    expect(out.row.id).toBe('A');
    expect(out.rows.map(r => r.id)).toEqual(['A:01', 'A:02']);
  });
  it('breakdown of a row that is no longer in the report is 404', async () => {
    await expect(reportService(cfg, 'sample-liquidity').breakdown(actingAs(), { selection: SEL, rowId: 'A:09', column: 'b1' }))
      .rejects.toMatchObject({ status: 404, message: 'This row is no longer in the report.' });
  });
  it('refuses an unknown column or no row (400); line items have no breakdown (404)', async () => {
    const svc = reportService(cfg, 'sample-liquidity');
    await expect(svc.breakdown(actingAs(), { selection: SEL, rowId: 'A', column: 'nope' })).rejects.toMatchObject({ status: 400, message: 'Unknown column nope.' });
    await expect(svc.breakdown(actingAs(), { selection: SEL, rowId: '', column: null })).rejects.toMatchObject({ status: 400 });
    await expect(reportService(cfg, 'sample-cashflow').breakdown(actingAs(), { selection: SEL, rowId: 'x', column: null })).rejects.toMatchObject({ status: 404 });
  });
  it('answers a request only from a listed origin with the app header', async () => {
    const req = (origin: string, appHeader = true) => new Request('http://127.0.0.1:3200/api/modules/sample-liquidity/report', {
      method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-app-user': 'tester', ...(appHeader ? { 'x-app-request': '1' } : {}) }, body: JSON.stringify({ selection: SEL })
    });
    expect((await handle(() => reportRequest(req('http://evil.example'), cfg, 'sample-liquidity', 'run'))).status).toBe(403);
    expect((await handle(() => reportRequest(req('http://localhost:3100', false), cfg, 'sample-liquidity', 'run'))).status).toBe(403);
    const ok = await handle(() => reportRequest(req('http://localhost:3100'), cfg, 'sample-liquidity', 'run'));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { rows: unknown[] }).rows).toHaveLength(15);
  });
});

describe('reports on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeEach(async () => {
    sap = await startMockSap({ sets: sapSets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it('reads through OData with the selection as $filter, one page of maxRows + 1, in SAP order', async () => {
    const out = await reportService(cfg, 'sample-liquidity').run(user, SEL);
    expect(out.rows.map(r => r.id)).toEqual(ORDER);
    expect(out.rows[2]).toMatchObject({ id: 'A:01:01', b1: '1320000.00', product: '51A' });
    const get = sap.log.find(r => r.method === 'GET' && r.rel === 'LiquidityRow');
    expect(get?.query.get('$filter')).toBe("Company eq '1000' and Month eq '01' and Year eq '2026'");
    expect(get?.query.get('$orderby')).toBe('Seq asc');
    expect(get?.query.get('$top')).toBe('20001');
    expect(get?.query.getAll('sap-client')).toEqual(['100']);
  });
  it('reads nothing of the report from SAP while the selection is invalid', async () => {
    await expect(reportService(cfg, 'sample-liquidity').run(user, { company: '', month: '01', year: '2026' })).rejects.toMatchObject({ status: 400 });
    expect(sap.log.filter(r => r.rel === 'LiquidityRow')).toEqual([]);
  });
});

describe('reports on SAP: short reads are refused, never shown as complete', () => {
  let sap: MockSap | undefined;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  const flowSets = (): Record<string, MockSet> => ({
    CashFlowLine: {
      key: 'Deal', keys: ['Company', 'Month', 'Year', 'Deal', 'PayDate'],
      rows: cashflowSeed().tables.flows.map(r => ({
        Company: r.company, Month: r.month, Year: r.year, Deal: r.deal, Counterparty: r.counterparty, CpName: r.cpName, Product: r.product,
        ProductText: r.productText, FlowType: r.flowType, FlowText: r.flowText, PayDate: r.payDate, Amount: Number(r.amount), Currency: r.currency
      }))
    }
  });
  const config = (base: string) => relayConfig({ base });
  afterEach(async () => { await sap?.close(); sap = undefined; });

  it('refuses a read SAP pages into more than 20 pages (502), never a partial page', async () => {
    sap = await startMockSap({ sets: flowSets(), pageSize: 1 });
    await expect(reportService(config(sap.base), 'sample-cashflow').run(user, { month: '01', year: '2026' }))
      .rejects.toMatchObject({ status: 502, message: 'CashFlowLine: SAP returned more pages than expected. Narrow the selection.' });
    expect(sap.log.filter(r => r.rel.startsWith('CashFlowLine'))).toHaveLength(20);
  });
  it('still reads a selection SAP pages within 20 pages', async () => {
    sap = await startMockSap({ sets: flowSets(), pageSize: 2 });
    expect((await reportService(config(sap.base), 'sample-cashflow').run(user, { month: '01', year: '2026' })).rows).toHaveLength(40);
  });
  it('refuses fewer rows than SAP counted (502)', async () => {
    sap = await startMockSap({ sets: sapSets(), countExtra: 5 });
    await expect(reportService(config(sap.base), 'sample-liquidity').run(user, SEL))
      .rejects.toMatchObject({ status: 502, message: 'SAP returned fewer rows than it counted. Try again or narrow the selection.' });
  });
});
