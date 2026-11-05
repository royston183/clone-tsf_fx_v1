// A report over another module (`source`): it reads that object module's header rows through the module's own backend
// and on its side. The motivating case is the third e2e app's "Leases Ending Soon": it had to be a dashboard, because a
// report could neither read the Leases module nor open with today and 60 days (so Excel/CSV export and layouts were lost).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { platform, setPlatform } from '@core/platform';
import { loadSapConfig } from '@core/sap/config';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { moduleService, moduleSide, resetModuleBackends } from '@core/server/module-service';
import { objectService } from '@core/server/object-service';
import { reportService } from '@core/server/report-service';
import { browserPlatform } from '@/lib/client/browser-platform';
import { onSampleData, remote, remoteLayouts, sourceLabel, sourceStatus } from '@/lib/client/data';
import type { FieldDef } from '@/lib/fields/types';
import { HttpError } from '@/lib/errors';
import type { Option, Row } from '@/lib/grid/types';
import { moduleTables, reportSourceProblem } from '@/modules/tables';
import { SERVER_MODULES, sourceOf, type ModuleData } from '@/modules/server-registry';
import type { AnyObjectDef, AnyReportDef } from '@/modules/types';
import { actingAs, freshConfig, installTestPlatform, relayConfig } from '../support/platform';
import { startMockSap, type MockSap } from '../support/mock-sap';

// The data client is built for an FE + BE + DB application here (src/runtime.ts).
vi.mock('@/runtime', () => ({ APP_TYPE: 'fullstack' }));
installTestPlatform();

const CURRENCIES = [{ value: 'INR', label: 'INR' }, { value: 'USD', label: 'USD' }];
const STATUSES = [{ value: 'D', label: 'Draft' }, { value: 'A', label: 'Active' }, { value: 'E', label: 'Ended' }];
const lease: FieldDef = { field: 'lease', label: 'Lease No.', type: 'code', max: 10, key: true };
const lessor: FieldDef = { field: 'lessor', label: 'Lessor', type: 'text', max: 60 };
const endDate: FieldDef = { field: 'endDate', label: 'End Date', type: 'date' };
const rent: FieldDef = { field: 'rent', label: 'Monthly Rent', type: 'amount', currencyField: 'currency' };
const currency: FieldDef = { field: 'currency', label: 'Currency', type: 'select', options: CURRENCIES };
const status: FieldDef = { field: 'status', label: 'Status', type: 'select', options: STATUSES };

/** The Leases object module of the e2e app, cut down to its list. */
const leases: AnyObjectDef = {
  kind: 'object', id: 'test-leases', title: 'Leases', noun: ['Lease', 'Leases'], serviceKey: 'samples', storageKey: 'test-leases',
  opens: { create: 'popup', open: 'popup' },
  list: {
    entity: 'leases', keys: ['lease'], columns: [], fields: [lease, lessor, endDate, rent, currency, status],
    filters: ['status', 'currency', 'endDate'], defaultSort: { field: 'lease', dir: 1 }
  },
  header: [lease, lessor, endDate, rent, currency, status], tabs: [], lookups: () => ({})
};
const LEASES: Row[] = [
  { lease: 'L1', lessor: 'Acme', endDate: '2026-11-10', rent: '1000.00', currency: 'INR', status: 'A' },
  { lease: 'L2', lessor: 'Birla', endDate: '2026-12-20', rent: '2000.00', currency: 'USD', status: 'A' },
  { lease: 'L3', lessor: 'Cipla', endDate: '2027-03-01', rent: '3000.00', currency: 'INR', status: 'A' },
  { lease: 'L4', lessor: 'Dabur', endDate: '2026-11-15', rent: '4000.00', currency: 'INR', status: 'E' }
];

/** "Leases Ending Soon" as the report it wanted to be: Leases' rows, the active ones ending within N days of a key date. */
const ending: AnyReportDef = {
  kind: 'report', id: 'test-leases-ending', title: 'Leases Ending Soon', serviceKey: 'samples', storageKey: 'test-leases-ending',
  breakdownOpens: 'popup', source: { module: 'test-leases' },
  selection: [
    { field: 'keyDate', label: 'Key Date', type: 'date', required: true },
    { field: 'days', label: 'Days Ahead', type: 'integer', max: 4, required: true },
    { field: 'status', label: 'Status', type: 'select', options: STATUSES },
    // Its options are the Leases module's lookups (the report reads them through Leases' backend).
    { field: 'currency', label: 'Currency', type: 'select', options: (lk: { currencies: Option[] }) => lk.currencies }
  ],
  defaults: () => ({ keyDate: '2026-10-31', days: '60', status: 'A' }),
  autoRun: true,
  report: {
    variant: 'lineItems', entity: 'leases', window: { field: 'endDate', keyDate: 'keyDate', days: 'days' },
    columns: [
      { id: 'endDate', label: 'End Date', type: 'date' }, { id: 'lease', label: 'Lease No.', type: 'code' }, { id: 'lessor', label: 'Lessor', type: 'text' },
      { id: 'rent', label: 'Monthly Rent', type: 'amount', currencyField: 'currency' }
    ],
    standard: { columns: ['endDate', 'lease', 'lessor', 'rent'], sort: [{ col: 'endDate', desc: false }], subtotals: [], unit: null, subtotalsOnly: false }
  },
  lookups: raw => ({ currencies: (raw?.currencies ?? []).map(r => ({ value: r.code, label: r.code })) })
};

const LEASES_ENTRY: ModuleData = {
  def: leases, contract: { service: 'TEST', naming: 'pascal', tables: { leases: { entitySet: 'Lease' } } },
  seed: () => ({ tables: { leases: structuredClone(LEASES) }, lookups: { currencies: CURRENCIES.map(c => ({ code: c.value })) } })
};
beforeAll(() => {
  SERVER_MODULES['test-leases'] = LEASES_ENTRY;
  // No contract, no seed and no source of its own: it reads the Leases module, where Leases' data lives.
  SERVER_MODULES['test-leases-ending'] = { def: ending };
});
afterAll(() => { delete SERVER_MODULES['test-leases']; delete SERVER_MODULES['test-leases-ending']; installTestPlatform(); });

describe('a report over another module (source)', () => {
  let cfg: AppConfig;
  afterEach(() => { installTestPlatform(); });

  it("returns the module's header rows inside the selection and window (sample data)", async () => {
    cfg = freshConfig();
    const svc = reportService(cfg, 'test-leases-ending');
    const out = await svc.run(actingAs(), { keyDate: '2026-10-31', days: '60', status: 'A' });
    expect(out.rows.map(r => r.lease)).toEqual(['L1', 'L2']);
    expect(out.rows[0]).toMatchObject({ lessor: 'Acme', rent: '1000.00', currency: 'INR' });
    expect(out.columns.map(c => c.id)).toEqual(['endDate', 'lease', 'lessor', 'rent']);
    expect(out.meta.selectionText).toContain('31-10-2026');
    expect((await svc.run(actingAs(), { keyDate: '2026-10-31', days: '200', status: 'A', currency: 'INR' })).rows.map(r => r.lease)).toEqual(['L1', 'L3']);
    expect((await svc.run(actingAs(), { keyDate: '2026-10-31', days: '60' })).rows.map(r => r.lease)).toEqual(['L1', 'L4', 'L2']);
    await expect(svc.run(actingAs(), { keyDate: '2026-10-31' })).rejects.toMatchObject({ status: 400, details: [{ field: 'days' }] });
  });
  it("reads through the module's own backend: a change saved in Leases shows in the report", async () => {
    cfg = freshConfig();
    const objects = objectService(cfg, 'test-leases');
    const l3 = await objects.read(actingAs(), { lease: 'L3' });
    await objects.update(actingAs(), { key: { lease: 'L3' }, etag: l3.header.__etag, header: { ...l3.header, endDate: '2026-11-20' }, items: {} });
    const out = await reportService(cfg, 'test-leases-ending').run(actingAs(), { keyDate: '2026-10-31', days: '60', status: 'A' });
    expect(out.rows.map(r => r.lease)).toEqual(['L1', 'L3', 'L2']);
    expect(moduleSide(cfg, 'test-leases', () => new HttpError(422, 'no')).def).toBe(leases);
  });
  it('refuses a module whose data lives on the other side (422), as dashboards do', async () => {
    cfg = freshConfig();
    // The browser of an FE + BE + DB application: it does not keep the `app` modules (the BackEnd does).
    setPlatform({ ...platform(), keeps: entry => entry.source !== 'app' });
    resetModuleBackends();
    const saved = SERVER_MODULES['test-leases'];
    SERVER_MODULES['test-leases'] = { ...saved, source: 'app' };
    try {
      await expect(reportService(cfg, 'test-leases-ending').run(actingAs(), { keyDate: '2026-10-31', days: '60' })).rejects.toMatchObject({
        status: 422,
        message: 'Report test-leases-ending cannot read module test-leases. A report can read only modules whose data lives on the same side: SAP and sample-data modules in the browser, app modules in the BackEnd.'
      });
    } finally { SERVER_MODULES['test-leases'] = saved; }
  });
  it('has no tables of its own (no schema, no seed)', () => {
    expect(moduleTables(ending)).toEqual({});
  });
  it("gets the module's lookups (read through its backend) for its own lookups function", async () => {
    cfg = freshConfig();
    const view = await moduleService(cfg, 'test-leases-ending').view(actingAs());
    expect(view.lookups).toEqual({ currencies: [{ code: 'INR' }, { code: 'USD' }] });
    expect(ending.lookups(view.lookups).currencies.map((o: Option) => o.value)).toEqual(['INR', 'USD']);
    const svc = reportService(cfg, 'test-leases-ending');
    expect((await svc.run(actingAs(), { keyDate: '2026-10-31', days: '60', currency: 'USD' })).rows.map(r => r.lease)).toEqual(['L2']);
    await expect(svc.run(actingAs(), { keyDate: '2026-10-31', days: '60', currency: 'EUR' })).rejects.toMatchObject({ status: 400, details: [{ field: 'currency' }] });
  });
});

describe('a report over a module on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  const odata = (r: Row) => ({ Lease: r.lease, Lessor: r.lessor, EndDate: r.endDate, Rent: Number(r.rent), Currency: r.currency, Status: r.status });
  beforeEach(async () => {
    SERVER_MODULES['test-leases'] = { ...LEASES_ENTRY, source: 'sap' };
    sap = await startMockSap({ sets: { Lease: { key: 'Lease', rows: LEASES.map(odata) } } });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { SERVER_MODULES['test-leases'] = LEASES_ENTRY; await sap.close(); installTestPlatform(); });

  it("reads the module's entity set through its OData backend, with the selection and window as $filter", async () => {
    expect(sourceOf(SERVER_MODULES['test-leases-ending'])).toBe('sap');
    const out = await reportService(cfg, 'test-leases-ending').run(user, { keyDate: '2026-10-31', days: '60', status: 'A' });
    expect(out.rows.map(r => r.lease)).toEqual(['L1', 'L2']);
    expect(out.rows[0]).toMatchObject({ lessor: 'Acme', endDate: '2026-11-10', currency: 'INR' });
    const get = sap.log.find(r => r.method === 'GET' && r.rel === 'Lease');
    expect(get?.query.get('$filter')).toBe("Status eq 'A' and (EndDate ge 2026-10-31 and EndDate le 2026-12-30)");
    expect(get?.query.get('$orderby')).toBe('EndDate asc');
  });
  it("labels its data with the module's service, not a blank one", async () => {
    const view = await moduleService(cfg, 'test-leases-ending').view(user);
    expect(view).toMatchObject({ mode: 'odata', service: 'TEST' });
    expect(sourceLabel('test-leases-ending', view)).toBe('SAP OData · TEST');
  });
});

describe("a report over another module takes that module's data source, whatever it was registered with", () => {
  afterEach(() => { SERVER_MODULES['test-leases'] = LEASES_ENTRY; SERVER_MODULES['test-leases-ending'] = { def: ending }; installTestPlatform(); });
  for (const [what, own] of [['no source', undefined], ['a wrong source', 'sap']] as const) {
    it(`registered with ${what}, over an app module (FE + BE + DB): answered by the BackEnd like the module`, () => {
      SERVER_MODULES['test-leases'] = { ...LEASES_ENTRY, source: 'app' };
      SERVER_MODULES['test-leases-ending'] = { def: ending, ...(own ? { source: own } : {}) };
      const entry = SERVER_MODULES['test-leases-ending'];
      expect(sourceOf(entry)).toBe('app');
      expect(remote('test-leases-ending')).toBe(true);
      expect(remoteLayouts('test-leases-ending')).toBe(true);
      expect(onSampleData('test-leases-ending')).toBe(false);
      expect(sourceStatus('test-leases-ending')).toEqual(sourceStatus('test-leases'));
      // The browser does not keep it (no 422 there: the BackEnd runs it, beside the Leases data).
      expect(browserPlatform(loadSapConfig({}), 'fullstack').keeps?.(entry)).toBe(false);
    });
  }
  it('over a module on sample data: on sample data too, whatever it was registered with', () => {
    SERVER_MODULES['test-leases-ending'] = { def: ending, source: 'app' };
    expect(sourceOf(SERVER_MODULES['test-leases-ending'])).toBeUndefined();
    expect(remote('test-leases-ending')).toBe(false);
    expect(onSampleData('test-leases-ending')).toBe(true);
  });
});

describe('reportSourceProblem (the definitions test runs it on every report with a source)', () => {
  it('accepts an object module whose list is the report entity and has every field the report filters and orders by', () => {
    expect(reportSourceProblem(ending, leases)).toBe('');
  });
  it('flags a report entity that is not the module list entity', () => {
    expect(reportSourceProblem({ ...ending, report: { ...ending.report, entity: 'lease' } }, leases)).toBe('report.entity lease is not the list entity leases of test-leases.');
  });
  it('flags an unknown or non-object module, and a filter field the module does not have', () => {
    expect(reportSourceProblem(ending, undefined)).toBe('source module test-leases is not registered.');
    expect(reportSourceProblem(ending, { ...ending, id: 'test-leases' })).toBe('source module test-leases is not an object module.');
    const extra = { ...ending, selection: [...ending.selection, { field: 'region', label: 'Region', type: 'text' as const }] };
    expect(reportSourceProblem(extra, leases)).toBe('test-leases has no field region (the report filters or orders by it).');
  });
  it('says nothing for a report without a source', () => {
    expect(reportSourceProblem({ ...ending, source: undefined }, undefined)).toBe('');
  });
});
