// The BackEnd keeps the application's own data (`app` modules) in its database; other modules are not its data.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@core/actor';
import { setPlatform } from '@core/platform';
import { moduleService, resetModuleBackends } from '@core/server/module-service';
import { objectService } from '@core/server/object-service';
import { dashboardService, wrongSide } from '@core/server/dashboard-service';
import { reportService } from '@core/server/report-service';
import { dealsSeed } from '@/modules/samples/deals/seed';
import type { AnyReportDef } from '@/modules/types';
import { SERVER_MODULES } from '@/modules/server-registry';
import { sqliteDriver } from '../../src/db';
import { NOT_KEPT, storesPlatform } from '../../src/platform-node';
import { freshStore, memoryDb, testConfig } from '../support/config';

const actor: Actor = { id: 'TESTER', username: 'TESTER', sap: null };

describe('where a module keeps its data', () => {
  it("keeps edits to an 'app' module in the database: they survive a reset", async () => {
    const db = freshStore();
    const cfg = testConfig();
    const key = { deal: '0000010001' };
    const rename = async (name: string) => {
      const svc = objectService(cfg, 'sample-deals');
      const obj = await svc.read(actor, key);
      return svc.update(actor, { key, etag: obj.header.__etag, header: { ...obj.header, name }, items: obj.items });
    };
    await rename('First edit');
    await rename('Second edit');
    resetModuleBackends();
    const read = await objectService(cfg, 'sample-deals').read(actor, key);
    expect(read.header.name).toBe('Second edit');
    expect(db.prepare("SELECT name FROM sample_deals__deals WHERE deal = '0000010001'").get()).toEqual({ name: 'Second edit' });
    expect((db.prepare('SELECT module_id FROM app_modules').all() as { module_id: string }[]).map(r => r.module_id)).toEqual(['sample-deals']);
  });
  it('refuses a Gallery sample where no dev-only tables are kept (the MySQL platform): 404', () => {
    setPlatform(storesPlatform({ driver: sqliteDriver(memoryDb()), devTables: false }));
    resetModuleBackends();
    try {
      expect(() => moduleService(testConfig(), 'sample-deals')).toThrow(expect.objectContaining({ status: 404, message: NOT_KEPT }));
    } finally { freshStore(); }
  });
  it('refuses a module inside SAP or still on sample data (404): the browser reads those', () => {
    freshStore();
    const cfg = testConfig();
    for (const id of ['timebuckets', 'sample-monthly']) {
      expect(() => moduleService(cfg, id), id).toThrow("This application's data is not kept by the BackEnd.");
    }
  });
});

describe('a dashboard kept by the BackEnd', () => {
  afterEach(() => { delete SERVER_MODULES['test-treasury-app']; vi.restoreAllMocks(); });
  it('cannot read a report the browser reads (SAP or sample data), and says why', async () => {
    freshStore();
    const cfg = testConfig();
    // The Treasury dashboard as the application's own data; its reports stay on sample data (read in the browser).
    const treasury = SERVER_MODULES['sample-treasury'];
    SERVER_MODULES['test-treasury-app'] = { ...treasury, def: { ...treasury.def, id: 'test-treasury-app' }, source: 'app' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = await dashboardService(cfg, 'test-treasury-app').load(actor, { company: '1000', month: '01', year: '2026' });
    const message = wrongSide('test-treasury-app', 'sample-liquidity').message;
    expect(message).toContain('A dashboard can read only reports whose data lives on the same side: SAP and sample-data reports in the browser, app reports in the BackEnd.');
    expect(Object.values(out.sections).some(r => 'error' in r && r.error.endsWith(message))).toBe(true);
    for (const r of Object.values(out.sections)) expect(r).toMatchObject({ error: expect.stringContaining('A dashboard can read only reports whose data lives on the same side') });
  });
});

describe('a report over an app module (source), kept by the BackEnd', () => {
  // Deals starting within N days of a key date, read from the Deals module's own tables: the report has no table,
  // contract or seed of its own.
  const starting: AnyReportDef = {
    kind: 'report', id: 'test-deals-starting', title: 'Deals Starting Soon', serviceKey: 'samples', storageKey: 'test-deals-starting', devOnly: true,
    breakdownOpens: 'popup', source: { module: 'sample-deals' },
    selection: [
      { field: 'keyDate', label: 'Key Date', type: 'date', required: true },
      { field: 'days', label: 'Days Ahead', type: 'integer', max: 4, required: true },
      { field: 'currency', label: 'Currency', type: 'text', max: 3 }
    ],
    report: {
      variant: 'lineItems', entity: 'deals', window: { field: 'start', keyDate: 'keyDate', days: 'days' },
      columns: [{ id: 'start', label: 'Valid From', type: 'date' }, { id: 'deal', label: 'Deal', type: 'code' }, { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' }],
      standard: { columns: ['start', 'deal', 'amount'], sort: [], subtotals: [], unit: null, subtotalsOnly: false }
    },
    lookups: () => ({})
  };
  afterEach(() => { delete SERVER_MODULES['test-deals-starting']; delete SERVER_MODULES['test-deals-sap']; delete SERVER_MODULES['test-deals-sap-starting']; });

  it("reads the module's rows from its tables, inside the selection and window", async () => {
    const db = freshStore();
    // Registered with no source: it takes the Deals module's (app), so the BackEnd keeps it.
    SERVER_MODULES['test-deals-starting'] = { def: starting };
    const out = await reportService(testConfig(), 'test-deals-starting').run(actor, { keyDate: '2025-05-01', days: '10', currency: 'USD' });
    const want = dealsSeed().tables.deals.filter(r => r.currency === 'USD' && r.start >= '2025-05-01' && r.start <= '2025-05-11');
    expect(want.length).toBeGreaterThan(0);
    expect(out.rows.map(r => r.deal).sort()).toEqual(want.map(r => r.deal).sort());
    expect(out.rows.map(r => r.start)).toEqual([...out.rows.map(r => r.start)].sort());
    // Read from the Deals module's table; the report made no table of its own.
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'test_deals_starting%'").all()).toEqual([]);
  });
  it('refuses a module the BackEnd does not keep (422)', async () => {
    freshStore();
    SERVER_MODULES['test-deals-sap'] = { ...SERVER_MODULES['sample-deals'], def: { ...SERVER_MODULES['sample-deals'].def, id: 'test-deals-sap' }, source: 'sap' };
    // Its hand-typed source is ignored: it is a SAP report now, which the browser runs; called here it is refused.
    SERVER_MODULES['test-deals-sap-starting'] = { def: { ...starting, id: 'test-deals-sap-starting', source: { module: 'test-deals-sap' } }, source: 'app' };
    await expect(reportService(testConfig(), 'test-deals-sap-starting').run(actor, { keyDate: '2025-03-01', days: '10' })).rejects.toMatchObject({
      status: 422, message: expect.stringContaining('Report test-deals-sap-starting cannot read module test-deals-sap.')
    });
  });
});
