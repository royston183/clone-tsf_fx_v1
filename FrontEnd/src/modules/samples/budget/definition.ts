// Gallery sample (T-upload): budget lines per GL account, cost center and period, uploaded from .xlsx or .csv.
import type { LookupItem } from '@/lib/grid/types';
import type { UploadModuleDef } from '../../types';
import { CURRENCIES, GL_ACCOUNTS } from '../lookups';

export interface BudgetLookups { gls: LookupItem[]; currencies: LookupItem[] }

export const budget: UploadModuleDef<BudgetLookups> = {
  kind: 'upload', id: 'sample-budget', title: 'Budget Upload', noun: ['budget line', 'budget lines'], serviceKey: 'samples', storageKey: 'smui-sample-budget', devOnly: true,
  entity: 'budget', keys: ['gl', 'costCenter', 'month', 'year'],
  columns: [
    { field: 'gl', label: 'GL Account *', type: 'suggest', lookup: lk => lk.gls, max: 10, key: true, required: true, mono: true },
    { field: 'costCenter', label: 'Cost Center *', type: 'code', max: 10, key: true, required: true },
    { field: 'month', label: 'Period *', type: 'period', yearField: 'year', key: true, required: true },
    { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', precision: 15, required: true },
    { field: 'currency', label: 'Currency *', type: 'suggest', lookup: lk => lk.currencies, max: 3, required: true }
  ],
  mode: 'upsert',
  strict: false,
  maxRows: 5000,
  maxBytes: 5 * 1048576,
  check: rows => rows.flatMap((r, i) => (r.amount.startsWith('-') ? [{ row: i + 1, field: 'amount', message: 'Budget amounts must not be negative.' }] : [])),
  lookups: () => ({ gls: GL_ACCOUNTS, currencies: CURRENCIES })
};
