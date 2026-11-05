// View List of TSF Deals (ZSGTSF_RFX_BLOTTER_COMP): read-only FX transactions that carry a TSF Deal ID, by blotter date.
// SAP: TrmFxApp (ZSGTSFTR_APP_STR) joined to FxTransaction; master contract, model and P&L from the TSF tables.
import type { LookupItem, Option, Row } from '@/lib/grid/types';
import type { ReportColumn } from '@/lib/report/types';
import type { ReportModuleDef } from '../types';
import { TSF_COMPANIES, TSF_TRADERS } from './lookups';

export interface TsfDealsLookups { companies: LookupItem[]; traders: Option[] }

const reversed = (r: Row) => r.reversed === 'X' || r.reversed === 'true';
const statusTone = (r: Row): 'green' | 'amber' | 'red' =>
  reversed(r) || ['02', '04', '05', '08', '11'].includes(String(r.txnStatus)) ? 'red' : ['01', '03', '06', '10', '12'].includes(String(r.txnStatus)) ? 'amber' : 'green';

// Columns of ZFS_CE_TsfDeal. Deal P&L, FX model and sub-type come from the TSF tables on the Azure middleware
// (tsfDealId, fxModel) once that source is connected.
const columns: ReportColumn[] = [
  { id: 'rfha', label: 'Transaction', type: 'code', transaction: { companyField: 'companyCode' } },
  { id: 'companyCode', label: 'Company Code', type: 'code' },
  { id: 'dealId', label: 'Deal ID', type: 'code' },
  { id: 'dealType', label: 'Deal Type', type: 'code' },
  { id: 'dealDesc', label: 'Deal Description', type: 'text' },
  { id: 'productType', label: 'Product Type', type: 'code' },
  { id: 'transactionType', label: 'Transaction Type', type: 'code' },
  { id: 'partner', label: 'Partner Name', type: 'text' },
  { id: 'blotterDate', label: 'Blotter Date', type: 'date' },
  { id: 'tradeDate', label: 'Trade Date', type: 'date' },
  { id: 'valueDate', label: 'Value Date', type: 'date' },
  { id: 'bs1', label: 'Buy / Sell 1', type: 'text' },
  { id: 'curr1', label: 'Currency 1', type: 'code' },
  { id: 'amount1', label: 'Amount 1', type: 'amount', currencyField: 'curr1' },
  { id: 'bs2', label: 'Buy / Sell 2', type: 'text' },
  { id: 'curr2', label: 'Currency 2', type: 'code' },
  { id: 'amount2', label: 'Amount 2', type: 'amount', currencyField: 'curr2' },
  { id: 'spotRate', label: 'Spot Rate', type: 'rate', scale: 6 },
  { id: 'swapRate', label: 'Swap Rate', type: 'rate', scale: 6 },
  { id: 'allInRate', label: 'All-in Rate', type: 'rate', scale: 6 },
  { id: 'trader', label: 'Trader', type: 'code' },
  { id: 'intRef', label: 'Internal Reference', type: 'text' },
  { id: 'txnStatus', label: 'Status', type: 'code', textField: 'statusText', statusTone },
  { id: 'mcRef', label: 'MC Ref No', type: 'code' },
  { id: 'foRemark', label: 'FO Remark', type: 'text' },
  { id: 'moRemark', label: 'MO Remark', type: 'text' },
  { id: 'ndfFixDate', label: 'NDF Fixing Date', type: 'date' },
  { id: 'ndfRef', label: 'NDF Ref', type: 'code' },
  { id: 'ndfFoRemark', label: 'NDF FO Remark', type: 'text' },
  { id: 'ndfMoRemark', label: 'NDF MO Remark', type: 'text' }
];

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};
const today = () => new Date().toISOString().slice(0, 10);

export const tsfDeals: ReportModuleDef<TsfDealsLookups> = {
  kind: 'report', id: 'tsf-deals', title: 'View List of TSF Deals', serviceKey: 'tsf-deals', storageKey: 'tsf-deals-report',
  // A deal line opens as a pop-up of its facts: one record, no items to edit.
  breakdownOpens: 'popup',
  selection: [
    { field: 'companyCode', label: 'Company Code', type: 'suggest', lookup: lk => lk.companies, valueHelp: true, max: 4 },
    { field: 'blotterDate', label: 'Blotter Date *', type: 'dateRange', toField: 'blotterTo', required: true },
    { field: 'trader', label: 'Trader Code', type: 'code', max: 6 },
    // Optional: the FX screens read one Deal ID's transactions, or one status's queue (TsfDealId / TxnStatus in SAP).
    { field: 'dealId', label: 'Deal ID', type: 'code', max: 10 },
    { field: 'txnStatus', label: 'Txn Status', type: 'code', max: 2 }
  ],
  check: sel => (sel.blotterDate && sel.blotterTo && String(sel.blotterTo) < String(sel.blotterDate)
    ? [{ field: 'blotterDate', message: 'The start date must be on or before the end date.' }] : []),
  defaults: () => ({ blotterDate: firstOfMonth(), blotterTo: today() }),
  report: {
    variant: 'lineItems', entity: 'deals', columns,
    standard: {
      columns: ['rfha', 'companyCode', 'dealId', 'dealType', 'productType', 'partner', 'blotterDate', 'valueDate', 'bs1', 'curr1', 'amount1', 'bs2', 'curr2', 'amount2', 'allInRate', 'trader', 'txnStatus', 'mcRef'],
      sort: [{ col: 'blotterDate', desc: true }], subtotals: [], unit: null, subtotalsOnly: false
    },
    fields: ['reversed', 'partnerCode', 'activeStatus'],
    window: undefined,
    layouts: {}
  },
  lookups: () => ({ companies: TSF_COMPANIES, traders: TSF_TRADERS })
};
