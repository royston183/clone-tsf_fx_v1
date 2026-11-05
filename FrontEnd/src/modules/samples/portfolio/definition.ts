// The portfolio sample: a treasury portfolio on sample data that shows every dashboard part — key date bar and controls,
// company cards, KPI tiles, the deal lifecycle flow, chart cards and the summary table. It is a pattern for an Overview's
// parts, never an Overview to copy or adapt: an application designs its own from its own data (docs/how-to-add-an-application.md).
import type { LookupItem } from '@/lib/grid/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import type { DashboardModuleDef } from '../../types';
import { COMPANIES } from './seed';

export interface OverviewLookups { companies: LookupItem[] }

const today = () => new Date().toISOString().slice(0, 10);

export const portfolio: DashboardModuleDef<OverviewLookups> = {
  kind: 'dashboard', id: 'sample-portfolio', title: 'Treasury Portfolio Dashboard', serviceKey: 'samples', storageKey: 'smui-overview',
  selection: [
    { field: 'keyDate', label: 'Key date', type: 'date', required: true },
    { field: 'company', label: 'Company code', type: 'segmented', options: lk => [{ value: '', label: 'All' }, ...lk.companies.map(c => ({ value: c.CODE, label: c.CODE }))] }
  ],
  units: [{ ...DEFAULT_UNITS[0], label: 'Actual' }, DEFAULT_UNITS[3], { id: 'MILLIONS', label: 'Millions', divisor: 1000000 }],
  autoRun: true,
  defaultUnit: 'CRORES',
  defaults: () => ({ keyDate: today(), company: '' }),
  sampleSelection: { keyDate: '2026-10-27', company: '' },
  overview: {
    description: 'Deals, limits and collateral of every company code · sample data.',
    fullReport: 'sample-deals',
    scopeLine: sel => `Currency INR · Outstanding is principal plus accrued interest · collateral at the closing prices of the key date${sel.company ? ` · company code ${sel.company}` : ''}`
  },
  sections: [
    { kind: 'entities', id: 'companies', title: 'Company codes' },
    { kind: 'tiles', id: 'kpis', title: 'Key figures' },
    { kind: 'flow', id: 'lifecycle', title: 'Deal lifecycle', sub: 'Open items at each step, from request to maturity · select a box to open its list' },
    { kind: 'barList', id: 'products', title: 'Outstanding by product', sub: 'Principal and accrued interest by product type' },
    { kind: 'share', id: 'ageing', title: 'Days past due', sub: 'Outstanding by days past due' },
    { kind: 'barList', id: 'counterparties', title: 'Top counterparties', sub: 'Concentration by counterparty' },
    { kind: 'donut', id: 'collateral', title: 'Collateral by security type', sub: 'Pledged securities', measures: [{ id: 'market', label: 'Market value' }, { id: 'eligible', label: 'Eligible value' }] },
    { kind: 'table', id: 'summary', title: 'Deal summary', sub: 'By product' }
  ],
  lookups: () => ({ companies: COMPANIES })
};
