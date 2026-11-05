import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SectionData, SectionResult } from '@/lib/dashboard/types';
import { sumAmounts } from '@/lib/report/units';
import { newSapConnection } from '@core/sap/client';
import { HttpError } from '@/lib/errors';
import { loadConfig, type AppConfig } from '@core/server/config';
import { setPlatform } from '@core/platform';
import { loadSapConfig } from '@core/sap/config';
import { resetModuleBackends } from '@core/server/module-service';
import { dashboardService, wrongSide } from '@core/server/dashboard-service';
import { browserPlatform } from '@/lib/client/browser-platform';
import type { DashboardServer } from '@core/server/dashboard-types';
import { contract as cashflowContract } from '@/modules/samples/cashflow/contract';
import { cashflow } from '@/modules/samples/cashflow/definition';
import { cashflowSeed } from '@/modules/samples/cashflow/seed';
import { contract as liquidityContract } from '@/modules/samples/liquidity/contract';
import { liquidity } from '@/modules/samples/liquidity/definition';
import { liquiditySeed } from '@/modules/samples/liquidity/seed';
import { contract } from '@/modules/samples/treasury/contract';
import { treasuryServer } from '@/modules/samples/treasury/dashboard.server';
import { treasury } from '@/modules/samples/treasury/definition';
import { treasurySeed } from '@/modules/samples/treasury/seed';
import { SERVER_MODULES, type ModuleData } from '@/modules/server-registry';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';
import { stubLocalStorage } from '../support/storage';

installTestPlatform();

const SEL = { company: '1000', month: '01', year: '2026' };
const calls: string[] = [];
const recording: DashboardServer = {
  sections: Object.fromEntries(treasury.sections.map(s => [s.id, async (): Promise<SectionData> => { calls.push(s.id); return { kind: 'tiles', tiles: [] }; }]))
};
const failing: DashboardServer = { ...treasuryServer, sections: { ...treasuryServer.sections, gap: async () => { throw new Error('SAP timeout'); } } };
const refused: DashboardServer = { ...treasuryServer, sections: { ...treasuryServer.sections, gap: async () => { throw new HttpError(422, 'Too many rows (more than 20,000). Narrow the selection.'); } } };
const money = (v: string) => (v === '' ? null : Number(v));
const sapSets = (): Record<string, MockSet> => ({
  LiquidityRow: {
    key: 'Seq', keys: ['Company', 'Month', 'Year', 'Seq'],
    rows: liquiditySeed().tables.statement.map(r => ({
      Company: r.company, Month: r.month, Year: r.year, Seq: Number(r.seq), Id: r.id, Name: r.name, RowStyle: r.rowStyle, Split: r.split, Product: r.product,
      B1: money(r.b1), B2: money(r.b2), B3: money(r.b3), B4: money(r.b4), B5: money(r.b5), Total: money(r.total)
    }))
  },
  CashFlowLine: {
    key: 'Deal', keys: ['Company', 'Month', 'Year', 'Deal', 'PayDate'],
    rows: cashflowSeed().tables.flows.map(r => ({
      Company: r.company, Month: r.month, Year: r.year, Deal: r.deal, Counterparty: r.counterparty, CpName: r.cpName, Product: r.product,
      ProductText: r.productText, FlowType: r.flowType, FlowText: r.flowText, PayDate: r.payDate, Amount: Number(r.amount), Currency: r.currency
    }))
  }
});
function data(r: SectionResult | undefined): SectionData {
  if (!r || !('data' in r)) throw new Error(`no data: ${JSON.stringify(r)}`);
  return r.data;
}

beforeAll(() => {
  SERVER_MODULES['sample-liquidity'] = { def: liquidity, contract: liquidityContract, seed: liquiditySeed, source: 'sap' };
  SERVER_MODULES['sample-cashflow'] = { def: cashflow, contract: cashflowContract, seed: cashflowSeed, source: 'sap' };
  SERVER_MODULES['sample-treasury'] = { def: treasury, contract, seed: treasurySeed, dashboard: treasuryServer, source: 'sap' };
  SERVER_MODULES['test-treasury-failing'] = { def: { ...treasury, id: 'test-treasury-failing' }, contract, seed: treasurySeed, dashboard: failing, source: 'sap' };
  SERVER_MODULES['test-treasury-recording'] = { def: { ...treasury, id: 'test-treasury-recording' }, contract, seed: treasurySeed, dashboard: recording, source: 'sap' };
  SERVER_MODULES['test-treasury-refused'] = { def: { ...treasury, id: 'test-treasury-refused' }, contract, seed: treasurySeed, dashboard: refused, source: 'sap' };
});
afterEach(() => { vi.restoreAllMocks(); });

describe('dashboard service', () => {
  onSampleData('sample-liquidity', 'sample-cashflow', 'sample-treasury', 'test-treasury-failing', 'test-treasury-recording', 'test-treasury-refused');
  let cfg: AppConfig;
  beforeEach(async () => { cfg = freshConfig(); calls.length = 0; });

  it('loads every section; limits and RAG come from the server', async () => {
    const out = await dashboardService(cfg, 'sample-treasury').load(actingAs(), SEL);
    const kpis = data(out.sections.kpis);
    if (kpis.kind !== 'tiles') throw new Error('tiles expected');
    expect(kpis.tiles.map(t => [t.label, t.value, t.rag ?? ''])).toEqual([
      ['Outflows', '24600000.00', ''], ['Mismatch 1–7 days', '1.89', 'green'], ['Mismatch up to 30 days', '-17.54', 'red'], ['Cash flow lines', '20', '']
    ]);
    expect(kpis.tiles[1].delta).toEqual({ value: '+3.80 pts vs last month', good: 'up' });
    // One sign convention for the tile meter and the chart limit line: the value and the signed limit.
    expect(kpis.tiles[1].meter).toEqual({ value: '1.89', limit: '-10.00' });
    expect(kpis.tiles[2].meter).toEqual({ value: '-17.54', limit: '-15.00' });
    expect(kpis.tiles[2].drill).toEqual({ kind: 'screen', module: 'sample-liquidity', filters: SEL, label: 'Open the Liquidity Statement' });
    expect(kpis.tiles[3].drill).toMatchObject({ kind: 'screen', module: 'sample-cashflow', filters: SEL });

    const gap = data(out.sections.gap);
    if (gap.kind !== 'series') throw new Error('series expected');
    expect(gap.range).toBe('6m');
    expect(gap.series[0].limit).toBe('-10.00');
    expect(gap.series[0].limit).toBe(kpis.tiles[1].meter?.limit);
    expect(gap.series[0].points).toEqual([
      { x: 'Aug 25', y: '-17.72', status: 'red' }, { x: 'Sep 25', y: '-13.67', status: 'red' }, { x: 'Oct 25', y: '-9.69', status: 'amber' },
      { x: 'Nov 25', y: '-5.77' }, { x: 'Dec 25', y: '-1.91' }, { x: 'Jan 26', y: '1.89' }
    ]);

    const flows = data(out.sections.flows);
    if (flows.kind !== 'series') throw new Error('series expected');
    expect(flows.series.map(s => [s.name, s.points.length])).toEqual([['Interest', 6], ['Repayment', 6]]);
    // Company 1000 has repayment instalments in every month (the seed used to give them to company 2000 only).
    expect(flows.series[1].points.map(p => p.y)).toEqual(['427800.00', '1248100.00', '580250.00', '1320550.00', '885650.00', '815400.00']);
    expect(flows.series[0].points.map(p => p.y)).toEqual(['553098.00', '389109.00', '361839.00', '272291.00', '527905.00', '362936.00']);

    const mix = data(out.sections.mix);
    if (mix.kind !== 'slices') throw new Error('slices expected');
    const inr = cashflowSeed().tables.flows.filter(f => f.company === '1000' && f.month === '01' && f.year === '2026' && f.currency === 'INR');
    expect(sumAmounts(mix.slices.map(s => s.value))).toBe(sumAmounts(inr.map(f => f.amount)));

    const summary = data(out.sections.summary);
    if (summary.kind !== 'table') throw new Error('table expected');
    expect(summary.rows.map(r => r.label)).toEqual(['A. Outflows', 'B. Inflows', 'C. Mismatch (B − A)', 'E. Cumulative mismatch %']);
    expect(summary.rows[0].cells.b1).toBe('1320000.00');
    expect(summary.drill?.b1.lines.map(l => l.label)).toEqual(['Term loans', 'Fixed deposits', 'Interest receivable']);
    expect(summary.drill?.b1.target).toMatchObject({ kind: 'screen', module: 'sample-liquidity' });
    expect(out.chips).toEqual([{ label: 'Liquidity Statement: 15 rows', tone: 'saved' }, { label: 'Cash flows: 20 lines', tone: 'saved' }]);
  });
  it('reloads one section for a range, and refuses an unknown range or section', async () => {
    const svc = dashboardService(cfg, 'sample-treasury');
    const quarters = data(await svc.section(actingAs(), { selection: SEL, section: 'gap', range: '4q' }));
    if (quarters.kind !== 'series') throw new Error('series expected');
    expect(quarters.series[0].points.map(p => p.x)).toEqual(['Q4 FY25', 'Q1 FY26', 'Q2 FY26', 'Q3 FY26']);
    const year = data(await svc.section(actingAs(), { selection: SEL, section: 'gap', range: '12m' }));
    if (year.kind !== 'series') throw new Error('series expected');
    expect(year.series[0].points).toHaveLength(12);
    await expect(svc.section(actingAs(), { selection: SEL, section: 'gap', range: '5y' })).rejects.toMatchObject({ status: 400, message: 'Unknown range.' });
    await expect(svc.section(actingAs(), { selection: SEL, section: 'nope' })).rejects.toMatchObject({ status: 404, message: 'Unknown section.' });
    expect(data(await svc.section(actingAs(), { selection: SEL, section: 'kpis' })).kind).toBe('tiles');
  });
  it('one failing section returns the others', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await dashboardService(cfg, 'test-treasury-failing').load(actingAs(), SEL);
    expect(out.sections.gap).toEqual({ error: "Couldn't load Mismatch 1–7 days by month." });
    expect(data(out.sections.kpis).kind).toBe('tiles');
    expect(data(out.sections.summary).kind).toBe('table');
    expect(spy).toHaveBeenCalledWith('Dashboard test-treasury-failing, section gap:', expect.any(Error));
  });
  it('a section refused by a report read says why (the app message); other errors stay generic', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await dashboardService(cfg, 'test-treasury-refused').load(actingAs(), SEL);
    expect(out.sections.gap).toEqual({ error: "Couldn't load Mismatch 1–7 days by month: Too many rows (more than 20,000). Narrow the selection." });
    expect(data(out.sections.kpis).kind).toBe('tiles');
  });
  it('checks the selection before any section loads (400) and refuses data of the wrong kind', async () => {
    const svc = dashboardService(cfg, 'test-treasury-recording');
    await expect(svc.load(actingAs(), { company: '', month: '01', year: '2026' })).rejects.toMatchObject({ status: 400, message: 'Company Code is required' });
    expect(calls).toEqual([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await svc.load(actingAs(), SEL);
    expect(data(out.sections.kpis).kind).toBe('tiles');
    expect(out.sections.gap).toEqual({ error: "Couldn't load Mismatch 1–7 days by month." });
  });
  it('serves dashboard modules only', () => {
    expect(() => dashboardService(cfg, 'sample-liquidity')).toThrow('Unknown application.');
  });
  it('refuses a quarterStartMonth that is not a whole month 1–12 (periodsOf would never end)', () => {
    for (const q of [0, 13, 4.5, Number.NaN]) {
      SERVER_MODULES['test-treasury-quarter'] = { def: { ...treasury, id: 'test-treasury-quarter', quarterStartMonth: q }, contract, seed: treasurySeed, dashboard: treasuryServer, source: 'sap' };
      expect(() => dashboardService(cfg, 'test-treasury-quarter')).toThrow('quarterStartMonth');
    }
    delete SERVER_MODULES['test-treasury-quarter'];
  });
});

describe('dashboard service on SAP', () => {
  let sap: MockSap | undefined;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  afterEach(async () => { await sap?.close(); sap = undefined; });

  it('reads each report and period once per load: 12 entity reads for the Treasury Overview, not 19', async () => {
    sap = await startMockSap({ sets: sapSets() });
    const cfg = relayConfig(sap);
    const out = await dashboardService(cfg, 'sample-treasury').load(user, SEL);
    expect(treasury.sections.map(s => 'data' in (out.sections[s.id] ?? {}))).toEqual(treasury.sections.map(() => true));
    expect(out.chips?.map(c => c.label)).toEqual(['Liquidity Statement: 15 rows', 'Cash flows: 20 lines']);
    const reads = sap.log.filter(r => r.method === 'GET' && (r.rel.startsWith('LiquidityRow') || r.rel.startsWith('CashFlowLine')));
    // 6 months of the Liquidity Statement (the trend; tiles, table and chips reuse Jan and Dec) and 6 of the Cash Flow Lines.
    expect(reads.filter(r => r.rel.startsWith('LiquidityRow'))).toHaveLength(6);
    expect(reads.filter(r => r.rel.startsWith('CashFlowLine'))).toHaveLength(6);
    expect(new Set(reads.map(r => `${r.rel}|${r.query.get('$filter')}`)).size).toBe(12);
  });
});

describe('where a dashboard reads its reports', () => {
  // The Treasury dashboard (sample data, so it runs in the page) reads the Liquidity Statement and the Cash Flow Lines,
  // here made the application's own data (`app`).
  const saved = new Map<string, ModuleData>();
  beforeAll(() => {
    for (const id of ['sample-liquidity', 'sample-cashflow']) { saved.set(id, SERVER_MODULES[id]); SERVER_MODULES[id] = { ...SERVER_MODULES[id], source: 'app' }; }
    SERVER_MODULES['test-treasury-page'] = { def: { ...treasury, id: 'test-treasury-page' }, contract, seed: treasurySeed, dashboard: treasuryServer };
  });
  afterAll(() => {
    for (const [id, entry] of saved) SERVER_MODULES[id] = entry;
    delete SERVER_MODULES['test-treasury-page'];
    vi.unstubAllGlobals();
    installTestPlatform();
  });
  const start = (appType: 'fullstack' | 'frontend') => { setPlatform(browserPlatform(loadSapConfig({}), appType)); resetModuleBackends(); return loadConfig({}); };

  it('FE + BE + DB: a dashboard in the browser reads the app reports the BackEnd keeps through its API', async () => {
    // The BackEnd's POST /api/modules/:id/report, answering each report's sample rows.
    const rowsOf: Record<string, unknown[]> = { 'sample-liquidity': liquiditySeed().tables.statement, 'sample-cashflow': cashflowSeed().tables.flows };
    const fetch = vi.fn(async (url: string | URL) => {
      const hit = /\/api\/modules\/([^/?]+)\/report$/.exec(String(url));
      if (!hit) throw new TypeError(`unexpected request ${String(url)}`);
      return new Response(JSON.stringify({ rows: rowsOf[decodeURIComponent(hit[1])] ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('VITE_API_BASE_URL', 'http://backend.test');
    const out = await dashboardService(start('fullstack'), 'test-treasury-page').load(actingAs(), SEL);
    vi.unstubAllEnvs();
    expect(treasury.sections.map(s => 'data' in (out.sections[s.id] ?? {}))).toEqual(treasury.sections.map(() => true));
    const paths = new Set(fetch.mock.calls.map(([url]) => String(url).replace(/^.*(\/api\/)/, '$1')));
    expect(paths).toEqual(new Set(['/api/modules/sample-liquidity/report', '/api/modules/sample-cashflow/report']));
  });

  it('a platform without remote reads still refuses a report of the other side, and says why', async () => {
    const browser = browserPlatform(loadSapConfig({}), 'fullstack');
    setPlatform({ ...browser, remote: undefined });
    resetModuleBackends();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await dashboardService(loadConfig({}), 'test-treasury-page').load(actingAs(), SEL);
    const message = wrongSide('test-treasury-page', 'sample-liquidity').message;
    expect(message).toBe('Dashboard test-treasury-page cannot read report sample-liquidity. A dashboard can read only reports whose data lives on the same side: SAP and sample-data reports in the browser, app reports in the BackEnd.');
    for (const s of treasury.sections) expect(out.sections[s.id], s.id).toMatchObject({ error: expect.stringContaining('A dashboard can read only reports whose data lives on the same side') });
  });

  it('Front end only: the same dashboard reads the app reports, all kept in the page', async () => {
    stubLocalStorage();
    const out = await dashboardService(start('frontend'), 'test-treasury-page').load(actingAs(), SEL);
    expect(treasury.sections.map(s => 'data' in (out.sections[s.id] ?? {}))).toEqual(treasury.sections.map(() => true));
  });
});
