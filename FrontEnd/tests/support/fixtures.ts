import { afterAll, beforeAll } from 'vitest';
import { applications, type AppEntry } from '@/config/catalog';
import { SERVICES, type ServiceDef } from '@/config/services';
import type { Row, TabDef } from '@/lib/grid/types';
import { MODULES } from '@/modules/registry';
import { SERVER_MODULES, type DataSource } from '@/modules/server-registry';
import type { AnyModuleDef, ModuleDef, ReportModuleDef } from '@/modules/types';

// Test modules of the template's own tests (ids `test-*`), registered for one test file: the tests of the data client
// and the Settings screens run on them, never on the template's samples, so they hold in every application made
// from the template, whatever modules it has and whichever kind it is (FE + BE + DB, or Front end only).

/** The fixtures' SAP service: in services.json while the test file runs. */
export const FIXTURE_SERVICE: ServiceDef = {
  key: 'test-fixture', title: 'Test fixture', binding: 'ZFS_SB_TESTFIXTURE_O4_API',
  path: '/sap/opu/odata4/sap/zfs_sb_testfixture_o4_api/srvd_a2x/sap/zfs_sd_testfixture/0001/'
};

const tab: TabDef<unknown> = {
  id: 'items', label: 'Items', title: 'Items', noun: ['item', 'items'], editable: true, keys: ['code'],
  defaultSort: { col: 'code', dir: 1 },
  columns: [{ field: 'code', label: 'Code', text: r => r.code ?? '', code: true }, { field: 'text', label: 'Text', text: r => r.text ?? '' }],
  search: r => [r.code ?? '', r.text ?? ''], filters: [],
  grid: [{ field: 'code', label: 'Code *', type: 'code', max: 10, key: true, required: true }, { field: 'text', label: 'Text', type: 'text', max: 40 }],
  check: () => ({})
};
const definition = (id: string, title: string): ModuleDef<unknown> => ({
  id, title, serviceKey: FIXTURE_SERVICE.key, storageKey: `${id}-test`, noun: 'items', blankRows: 1, strict: false,
  opens: { create: 'popup', open: 'wizard' },
  tabs: [tab], fields: { items: ['code', 'text'] }, lookups: () => ({})
});
/** A line-item report with ALV layouts (the modules with saved layouts). */
const report = (id: string, title: string): ReportModuleDef<unknown> => ({
  kind: 'report', id, title, serviceKey: FIXTURE_SERVICE.key, storageKey: `${id}-test`, selection: [], lookups: () => ({}),
  breakdownOpens: 'popup',
  report: {
    variant: 'lineItems', entity: 'lines', layouts: {},
    columns: [{ id: 'code', label: 'Code', type: 'code' }, { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' }, { id: 'currency', label: 'Currency', type: 'code' }],
    standard: { columns: ['code', 'amount', 'currency'], sort: [{ col: 'code', desc: false }], subtotals: [], unit: null, subtotalsOnly: false }
  }
});
const SEED: { tables: Record<string, Row[]> } = {
  tables: { items: [{ code: 'A1', text: 'Alpha' }, { code: 'B2', text: 'Beta' }], lines: [{ code: 'A1', amount: '10.00', currency: 'INR' }] }
};

/** One fixture per data source (on SAP, the application's own data, still on its sample data), and a report with layouts. */
export const FIXTURES: Record<'sap' | 'app' | 'sample' | 'lines', { id: string; title: string; source?: DataSource; make?: (id: string, title: string) => AnyModuleDef }> = {
  sap: { id: 'test-sap', title: 'Test SAP items', source: 'sap' },
  app: { id: 'test-app', title: 'Test application items', source: 'app' },
  sample: { id: 'test-sample', title: 'Test sample items' },
  lines: { id: 'test-lines', title: 'Test report lines', make: report }
};

/** Registers the fixtures (modules, catalogue applications, the SAP service) before the file's tests; removes them after. */
export function registerFixtureModules(): void {
  const entries: AppEntry[] = [];
  beforeAll(() => {
    if (!SERVICES.some(s => s.key === FIXTURE_SERVICE.key)) SERVICES.push(FIXTURE_SERVICE);
    for (const { id, title, source, make = definition } of Object.values(FIXTURES)) {
      MODULES[id] = make(id, title);
      SERVER_MODULES[id] = {
        def: MODULES[id], contract: { service: FIXTURE_SERVICE.binding, naming: 'pascal', tables: { items: { entitySet: 'Item' }, lines: { entitySet: 'Line' } } },
        seed: () => structuredClone(SEED), ...(source ? { source } : {})
      };
      entries.push({ id, title, description: `${title} (test fixture).`, type: 'application', module: id, service: FIXTURE_SERVICE.key, href: `/test/${id}` });
    }
    applications.push(...entries);
  });
  afterAll(() => {
    for (const { id } of Object.values(FIXTURES)) { delete MODULES[id]; delete SERVER_MODULES[id]; }
    for (const e of entries) applications.splice(applications.indexOf(e), 1);
    const at = SERVICES.findIndex(s => s.key === FIXTURE_SERVICE.key);
    if (at >= 0) SERVICES.splice(at, 1);
  });
}
