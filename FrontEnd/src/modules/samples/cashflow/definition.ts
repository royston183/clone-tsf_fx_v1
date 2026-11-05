// Gallery sample (T-line-report): cash flow lines SAP sends flat. ALV layouts (shared and personal) arrange them;
// the standard layout subtotals by company and counterparty, per currency; a line opens its deal.
import type { LookupItem } from '@/lib/grid/types';
import type { ReportColumn } from '@/lib/report/types';
import type { ReportModuleDef } from '../../types';
import { COMPANIES } from '../lookups';

export interface CashflowLookups { companies: LookupItem[] }
const columns: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' },
  { id: 'counterparty', label: 'Counterparty', type: 'code', textField: 'cpName' },
  { id: 'deal', label: 'Deal', type: 'code' },
  { id: 'product', label: 'Product Type', type: 'code', textField: 'productText' },
  { id: 'flowType', label: 'Flow Type', type: 'code', textField: 'flowText' },
  { id: 'payDate', label: 'Payment Date', type: 'date' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' },
  { id: 'currency', label: 'Currency', type: 'code' }
];

export const cashflow: ReportModuleDef<CashflowLookups> = {
  kind: 'report', id: 'sample-cashflow', title: 'Cash Flow Lines', serviceKey: 'samples', storageKey: 'smui-sample-cashflow', devOnly: true,
  breakdownOpens: 'popup',
  selection: [
    { field: 'company', label: 'Company Code', type: 'suggest', lookup: lk => lk.companies, valueHelp: true, max: 4 },
    { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }
  ],
  report: {
    variant: 'lineItems', entity: 'flows', columns,
    standard: { columns: ['company', 'counterparty', 'deal', 'product', 'flowType', 'payDate', 'amount', 'currency'], sort: [{ col: 'payDate', desc: false }], subtotals: ['company', 'counterparty'], unit: null, subtotalsOnly: false },
    open: 'sample-deals', layouts: {}
  },
  lookups: () => ({ companies: COMPANIES })
};
