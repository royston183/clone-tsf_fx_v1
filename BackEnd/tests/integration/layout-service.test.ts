// tests/integration/layout-service.test.ts
import { platform } from '@core/platform';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultLayout } from '@/lib/layout/layout';
import type { LayoutState, LineItemReport, ReportColumn } from '@/lib/report/types';
import type { Actor } from '@core/actor';
import type { AppConfig } from '@core/server/config';
import { handle } from '@core/server/http';
import { layoutService, layoutsRequest } from '@core/server/layout-service';
import { contract as dealsContract } from '@/modules/samples/deals/contract';
import { deals } from '@/modules/samples/deals/definition';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { ODataContract, ReportModuleDef } from '@/modules/types';
import { currentDb, freshStore, testConfig } from '../support/config';

const COLUMNS: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' }, { id: 'counterparty', label: 'Counterparty', type: 'code' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' }, { id: 'currency', label: 'Currency', type: 'code' }
];
const STANDARD: LayoutState = { columns: ['company', 'counterparty', 'amount', 'currency'], sort: [], subtotals: ['company'], unit: null, subtotalsOnly: false };
const REPORT: LineItemReport = { variant: 'lineItems', entity: 'lines', columns: COLUMNS, standard: STANDARD, layouts: {} };
const lines: ReportModuleDef<unknown> = { kind: 'report', id: 'test-layouts', title: 'Lines', serviceKey: 'samples', storageKey: 'k', breakdownOpens: 'popup', lookups: () => ({}), selection: [], report: REPORT };
const contract: ODataContract = { service: 'X', naming: 'pascal', tables: { lines: { entitySet: 'Line' } } };
const as = (username: string): Actor => ({ id: username.toUpperCase(), username, sap: null });
const body = (name: string, scope: 'shared' | 'personal', layout: Partial<LayoutState> = {}, isDefault = false) => ({ name, description: '', scope, isDefault, layout: { ...STANDARD, ...layout } });

beforeAll(() => {
  SERVER_MODULES['test-layouts'] = { def: lines, contract, seed: { tables: { lines: [] } }, source: 'app' };
  SERVER_MODULES['test-layouts-sample'] = { def: { ...lines, id: 'test-layouts-sample' }, contract, seed: { tables: { lines: [] } } };
  SERVER_MODULES['test-layouts-owners'] = { def: { ...lines, id: 'test-layouts-owners', report: { ...REPORT, layouts: { sharedEditors: ['alice'] } } }, contract, seed: { tables: { lines: [] } }, source: 'app' };
  SERVER_MODULES['test-layouts-none'] = { def: { ...lines, id: 'test-layouts-none', report: { ...REPORT, layouts: undefined } }, contract, seed: { tables: { lines: [] } }, source: 'app' };
  SERVER_MODULES['test-deals-layouts'] = { def: { ...deals, id: 'test-deals-layouts', list: { ...deals.list, layouts: {} } }, contract: dealsContract, seed: { tables: { deals: [], flows: [] } }, source: 'app' };
  SERVER_MODULES['test-layouts-sap'] = { def: { ...lines, id: 'test-layouts-sap' }, contract, seed: { tables: { lines: [] } }, source: 'sap' };
});

describe('layout store', () => {
  let cfg: AppConfig;
  beforeEach(() => { freshStore(); cfg = testConfig(); });

  it('keeps personal layouts invisible to another user', async () => {
    const svc = layoutService(cfg, 'test-layouts');
    await svc.save(as('alice'), body('Mine', 'personal'));
    expect((await svc.list(as('alice'))).layouts.map(l => [l.name, l.scope, l.changedBy])).toEqual([['Mine', 'personal', 'ALICE']]);
    expect((await svc.list(as('bob'))).layouts).toEqual([]);
    await expect(svc.remove(as('bob'), 'Mine', 'personal')).rejects.toMatchObject({ status: 404, message: "Layout 'Mine' does not exist." });
    await svc.save(as('bob'), body('Mine', 'personal', { subtotals: [] }));
    expect((await svc.list(as('alice'))).layouts[0].layout.subtotals).toEqual(['company']);
  });
  it('shares layouts with everyone; names are unique per scope, case-insensitively', async () => {
    const svc = layoutService(cfg, 'test-layouts');
    await svc.save(as('alice'), body('By company', 'shared'));
    await svc.save(as('bob'), { ...body('BY COMPANY', 'shared'), description: 'Replaced' });
    await svc.save(as('bob'), body('By company', 'personal'));
    expect((await svc.list(as('carol'))).layouts.map(l => [l.name, l.scope, l.description, l.changedBy])).toEqual([['BY COMPANY', 'shared', 'Replaced', 'BOB']]);
    expect((await svc.list(as('bob'))).layouts.map(l => `${l.scope}:${l.name}`)).toEqual(['shared:BY COMPANY', 'personal:By company']);
  });
  it('refuses a shared save or delete by someone who is not a report owner (403)', async () => {
    const svc = layoutService(cfg, 'test-layouts-owners');
    await expect(svc.save(as('bob'), body('Team', 'shared'))).rejects.toMatchObject({ status: 403, message: 'Only the report owners may save or delete shared layouts.' });
    await svc.save(as('Alice'), body('Team', 'shared'));
    await expect(svc.remove(as('bob'), 'Team', 'shared')).rejects.toMatchObject({ status: 403 });
    await svc.save(as('bob'), body('Mine', 'personal'));
    expect((await svc.list(as('bob'))).layouts.map(l => l.name)).toEqual(['Team', 'Mine']);
  });
  it('refuses an unknown column, too many sorts and a subtotal on an amount (400)', async () => {
    const svc = layoutService(cfg, 'test-layouts');
    await expect(svc.save(as('alice'), body('x', 'shared', { columns: ['gone'] }))).rejects.toMatchObject({ status: 400, message: 'Unknown column gone.' });
    await expect(svc.save(as('alice'), body('x', 'shared', { sort: Array.from({ length: 6 }, () => ({ col: 'company', desc: false })) }))).rejects.toMatchObject({ status: 400, message: 'Sort by at most 5 columns.' });
    await expect(svc.save(as('alice'), body('x', 'shared', { subtotals: ['amount'] }))).rejects.toMatchObject({ status: 400, message: 'Subtotals are allowed on text columns only (Amount).' });
    expect((await svc.list(as('alice'))).layouts).toEqual([]);
  });
  it('opens the personal default, else the shared default; a new default clears the old one in its scope', async () => {
    const svc = layoutService(cfg, 'test-layouts');
    await svc.save(as('alice'), body('One', 'shared', {}, true));
    await svc.save(as('alice'), body('Two', 'shared', {}, true));
    expect((await svc.list(as('bob'))).layouts.filter(l => l.isDefault).map(l => l.name)).toEqual(['Two']);
    await svc.save(as('alice'), body('Mine', 'personal', {}, true));
    expect(defaultLayout((await svc.list(as('alice'))).layouts)?.name).toBe('Mine');
    expect(defaultLayout((await svc.list(as('bob'))).layouts)?.name).toBe('Two');
  });
  it('stores layouts in the layouts table and serialises writes', async () => {
    const svc = layoutService(cfg, 'test-layouts');
    await Promise.all(Array.from({ length: 8 }, (_, i) => svc.save(as('alice'), body(`L${i}`, 'shared'))));
    const stored = await platform().layouts('test-layouts', SERVER_MODULES['test-layouts']).load();
    expect(stored.map(l => l.name).sort()).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
    expect((await svc.remove(as('alice'), 'l3', 'shared')).layouts).toHaveLength(7);
  });
  it('keeps the layouts of a module inside SAP too, and refuses those of a module still on sample data (404)', async () => {
    await layoutService(cfg, 'test-layouts-sap').save(as('alice'), body('Mine', 'personal'));
    const rows = currentDb().prepare('SELECT module_id FROM layouts').all() as { module_id: string }[];
    expect(rows.map(r => r.module_id)).toContain('test-layouts-sap');
    expect(() => layoutService(cfg, 'test-layouts-sample')).toThrow("This application's data is not kept by the BackEnd.");
  });
  it('covers columns, one sort and the page size of a large list; refuses an application without layouts (404)', async () => {
    const svc = layoutService(cfg, 'test-deals-layouts');
    const std = { columns: ['deal', 'name', 'amount'], sort: [{ col: 'amount', desc: true }], subtotals: [], unit: null, subtotalsOnly: false };
    await expect(svc.save(as('alice'), { name: 'x', scope: 'personal', layout: { ...std, pageSize: 75 } })).rejects.toMatchObject({ status: 400, message: 'Page size must be one of 50, 100, 200.' });
    await expect(svc.save(as('alice'), { name: 'x', scope: 'personal', layout: { ...std, pageSize: 100, subtotals: ['product'] } })).rejects.toMatchObject({ status: 400, message: 'This list has no subtotals.' });
    expect((await svc.save(as('alice'), { name: 'Big first', scope: 'personal', layout: { ...std, pageSize: 100 } })).layouts[0].layout.pageSize).toBe(100);
    expect(() => layoutService(cfg, 'test-layouts-none')).toThrow('This application has no layouts.');
  });
  it('acts as the x-app-user of each request, and needs a listed origin and the app header for writes', async () => {
    const req = (method: string, origin: string, appHeader = true) => new Request('http://127.0.0.1:3200/api/modules/test-layouts/layouts?name=x&scope=shared', {
      method, headers: { origin, 'x-app-user': 'alice', ...(appHeader ? { 'x-app-request': '1' } : {}), ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}) },
      body: method === 'PUT' ? JSON.stringify(body('x', 'shared')) : undefined
    });
    const status = async (r: Request) => (await handle(() => layoutsRequest(r, cfg, 'test-layouts'))).status;
    expect(await status(req('PUT', 'http://evil.example'))).toBe(403);
    expect(await status(req('PUT', 'http://localhost:3100', false))).toBe(403);
    expect(await status(req('PUT', 'http://localhost:3100'))).toBe(200);
    expect(await status(req('GET', 'http://localhost:3100'))).toBe(200);
    expect(await status(req('DELETE', 'http://localhost:3100'))).toBe(200);
    expect(await status(req('DELETE', 'http://localhost:3100'))).toBe(404);
  });
});
