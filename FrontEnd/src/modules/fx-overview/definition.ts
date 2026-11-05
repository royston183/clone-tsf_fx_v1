// The TSF FX Overview: master contracts and TSF deals at a glance, from this application's own modules (sample data
// until the UI is approved). Read in the browser: both modules it reads are on the same side (docs: dashboards).
import type { LookupItem } from '@/lib/grid/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import type { DashboardModuleDef } from '../types';
import { TSF_COMPANIES } from '../tsf-deals/lookups';

export interface FxOverviewLookups { companies: LookupItem[] }

const today = () => new Date().toISOString().slice(0, 10);

export const fxOverview: DashboardModuleDef<FxOverviewLookups> = {
  kind: 'dashboard', id: 'fx-overview', title: 'TSF FX Overview', serviceKey: 'tsf-deals', storageKey: 'tsf-fx-overview',
  selection: [
    { field: 'keyDate', label: 'Key date', type: 'date', required: true },
    { field: 'company', label: 'Company code', type: 'segmented', options: lk => [{ value: '', label: 'All' }, ...lk.companies.map(c => ({ value: c.CODE, label: c.CODE }))] }
  ],
  units: [{ ...DEFAULT_UNITS[0], label: 'Actual' }, { id: 'THOUSANDS', label: 'Thousands', divisor: 1000 }, { id: 'MILLIONS', label: 'Millions', divisor: 1000000 }],
  autoRun: true,
  defaultUnit: 'MILLIONS',
  defaults: () => ({ keyDate: today(), company: '' }),
  sampleSelection: { keyDate: '2026-11-04', company: '' },
  overview: {
    description: 'Master contracts (SLC middleware) and TSF FX deals (SAP).',
    fullReport: 'tsf-deals',
    scopeLine: sel => `Amounts in USD · deals blotted in the 60 days to the key date${sel.company ? ` · company code ${sel.company}` : ''}`
  },
  sections: [
    { kind: 'tiles', id: 'kpis', title: 'Key figures' },
    { kind: 'flow', id: 'mcLifecycle', title: 'Master contract lifecycle', sub: 'From creation by FO to confirmation by MO and use by deals · select a box to open its list' },
    { kind: 'donut', id: 'dealStatus', title: 'TSF deals by status', sub: 'USD notional of the deal lines' },
    { kind: 'barList', id: 'byModel', title: 'Master contract value by FX model', sub: 'Confirmed and in-use contracts (USD)' },
    { kind: 'table', id: 'maturities', title: 'Upcoming maturities', sub: 'Open deal lines by value date' }
  ],
  lookups: () => ({ companies: TSF_COMPANIES })
};
