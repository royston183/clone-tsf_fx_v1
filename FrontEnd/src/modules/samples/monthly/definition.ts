// Gallery sample (T-items): monthly GL amounts for a company code and period, with totals per currency.
import type { LookupItem } from '@/lib/grid/types';
import type { ItemsModuleDef } from '../../types';
import { COMPANIES, CURRENCIES, GL_ACCOUNTS } from '../lookups';

export interface MonthlyLookups { companies: LookupItem[]; gls: LookupItem[]; currencies: LookupItem[] }

export const monthly: ItemsModuleDef<MonthlyLookups> = {
  kind: 'items', id: 'sample-monthly', title: 'Monthly Amounts', noun: ['amount', 'amounts'], serviceKey: 'samples', storageKey: 'smui-sample-monthly', devOnly: true,
  entity: 'amounts', keys: ['company', 'month', 'year', 'gl'],
  selection: [
    { field: 'company', label: 'Company Code *', type: 'suggest', lookup: lk => lk.companies, valueHelp: true, max: 4, required: true },
    { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }
  ],
  grid: [
    { field: 'gl', label: 'GL Account *', type: 'suggest', lookup: lk => lk.gls, valueHelp: true, max: 10, key: true, required: true, mono: true },
    { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', precision: 15, required: true },
    { field: 'currency', label: 'Currency *', type: 'suggest', lookup: lk => lk.currencies, valueHelp: true, max: 3, required: true },
    { field: 'remarks', label: 'Remarks', type: 'text', max: 40 }
  ],
  totals: ['amount'],
  check: rows => (rows.filter(r => r.gl.startsWith('6')).length > 1 ? [{ message: 'Key at most one depreciation account (6…) per period.' }] : []),
  maxRows: 500,
  lookups: () => ({ companies: COMPANIES, gls: GL_ACCOUNTS, currencies: CURRENCIES })
};
