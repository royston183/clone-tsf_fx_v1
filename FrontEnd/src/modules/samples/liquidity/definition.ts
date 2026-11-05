// Gallery sample (T-report): a liquidity statement SAP formats per company code and period — styled rows, buckets
// across with a second header line, breakdowns of headings and a drill from a product row to the Deals list.
import type { LookupItem } from '@/lib/grid/types';
import type { ReportColumn, RowStyle } from '@/lib/report/types';
import type { ReportModuleDef } from '../../types';
import { COMPANIES } from '../lookups';

export interface LiquidityLookups { companies: LookupItem[] }
export const BUCKETS: { id: string; label: string; code: string }[] = [
  { id: 'b1', label: '1–7 days', code: 'B1' }, { id: 'b2', label: '8–14 days', code: 'B2' }, { id: 'b3', label: '15–30 days', code: 'B3' },
  { id: 'b4', label: '1–3 months', code: 'B4' }, { id: 'b5', label: 'Over 3 months', code: 'B5' }
];
/** SAP's style value of a row → the report's row style. */
const STYLE: Record<string, RowStyle> = { HEADING: 'heading', LEVEL1: 'level1', SUBTOTAL: 'subtotal', TOTAL: 'total', PERCENT: 'percent', MISMATCH: 'warn' };
export const styleOf = (rowStyle: string | undefined): RowStyle => (rowStyle && Object.hasOwn(STYLE, rowStyle) ? STYLE[rowStyle] : 'normal');

const columns: ReportColumn[] = [
  { id: 'name', label: 'Group Name', type: 'text' },
  ...BUCKETS.map((b): ReportColumn => ({ id: b.id, label: b.label, subHeader: b.code, type: 'amount', drillable: true })),
  { id: 'total', label: 'Total', subHeader: 'Total', type: 'amount', drillable: true }
];

export const liquidity: ReportModuleDef<LiquidityLookups> = {
  kind: 'report', id: 'sample-liquidity', title: 'Liquidity Statement', serviceKey: 'samples', storageKey: 'smui-sample-liquidity', devOnly: true,
  breakdownOpens: 'popup',
  selection: [
    { field: 'company', label: 'Company Code *', type: 'suggest', lookup: lk => lk.companies, valueHelp: true, max: 4, required: true },
    { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }
  ],
  report: {
    variant: 'formatted', entity: 'statement', columns, idField: 'id', idLabel: 'Group ID', orderBy: 'seq',
    style: r => styleOf(r.rowStyle), parent: { by: 'prefix', separator: ':' },
    hideFlag: { field: 'split', label: 'Hide interest split rows' }, fields: ['rowStyle', 'split', 'product']
  },
  drill: row => {
    const style = styleOf(row.rowStyle);
    if (style === 'heading' || style === 'level1') return { kind: 'breakdown' };
    if (style === 'normal' && row.product) return { kind: 'screen', module: 'sample-deals', filters: { product: row.product, currency: 'INR' }, label: `Open the INR deals of product ${row.product}` };
    return { kind: 'none' };
  },
  lookups: () => ({ companies: COMPANIES })
};
