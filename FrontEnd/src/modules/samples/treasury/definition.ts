// Gallery sample (T-dashboard): key figures, a mismatch trend with its limit, cash flows by month and by product,
// and a liquidity summary with inline drill; tiles click through to both sample reports. Mock data only.
import type { LookupItem } from '@/lib/grid/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import type { DashboardModuleDef } from '../../types';
import { COMPANIES } from '../lookups';

export interface TreasuryLookups { companies: LookupItem[] }

export const treasury: DashboardModuleDef<TreasuryLookups> = {
  kind: 'dashboard', id: 'sample-treasury', title: 'Treasury Overview', serviceKey: 'samples', storageKey: 'smui-sample-treasury', devOnly: true,
  selection: [
    { field: 'company', label: 'Company Code *', type: 'suggest', lookup: lk => lk.companies, valueHelp: true, max: 4, required: true },
    { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }
  ],
  units: DEFAULT_UNITS.filter(u => u.id === 'LAKHS' || u.id === 'CRORES'),
  quarterStartMonth: 4,
  sampleSelection: { company: '1000', month: '01', year: '2026' },
  sections: [
    { kind: 'tiles', id: 'kpis', title: 'Key figures' },
    { kind: 'bars', id: 'gap', title: 'Mismatch 1–7 days by month' },
    { kind: 'line', id: 'flows', title: 'Cash flows in INR' },
    { kind: 'donut', id: 'mix', title: 'Cash flows by product (INR)' },
    { kind: 'table', id: 'summary', title: 'Liquidity summary' }
  ],
  lookups: () => ({ companies: COMPANIES })
};
