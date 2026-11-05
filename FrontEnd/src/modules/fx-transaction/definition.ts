// FxTransaction (ZFS_SB_TRMFX_O4_API): an FX deal in TRM (BAPI_FTR_FXT_*), keyed by company code + transaction number.
// Its bound actions: Settle (BAPI_FTR_FXT_SETTLE) and NdfFixing. Internal: the FX screens read a transaction and run
// Settle through the data client (objectAction); nothing here creates or deletes a transaction.
import { col } from '@/lib/grid/grid';
import { formatDate } from '@/lib/fields/parse';
import type { FieldDef } from '@/lib/fields/types';
import type { ObjectModuleDef } from '../types';

export interface FxTransactionLookups { [k: string]: never }

const code = (field: string, label: string, max: number): FieldDef<FxTransactionLookups> => ({ field, label, type: 'code', max });
const amount = (field: string, label: string, currencyField: string): FieldDef<FxTransactionLookups> => ({ field, label, type: 'amount', precision: 23, scale: 4, currencyField });
const rate = (field: string, label: string): FieldDef<FxTransactionLookups> => ({ field, label, type: 'decimal', precision: 13, scale: 9 });

/** ActivityCategory of a settled transaction. */
export const SETTLED_CATEGORY = '30';

export const FX_TRANSACTION_FIELDS: FieldDef<FxTransactionLookups>[] = [
  { ...code('companyCode', 'Company Code', 4), key: true }, { ...code('financialTransaction', 'Transaction', 13), key: true },
  code('productType', 'Product Type', 3), code('transactionType', 'Transaction Type', 3), code('partner', 'Partner', 10),
  { field: 'contractDate', label: 'Contract Date', type: 'date' }, { field: 'valueDate', label: 'Value Date', type: 'date' },
  code('valuationClass', 'Valuation Class', 4), code('portfolio', 'Portfolio', 10),
  code('buyCurrency', 'Buy Currency', 3), amount('buyAmount', 'Buy Amount', 'buyCurrency'), code('sellCurrency', 'Sell Currency', 3), amount('sellAmount', 'Sell Amount', 'sellCurrency'),
  code('leadCurrency', 'Lead Currency', 3), code('followCurrency', 'Follow Currency', 3), code('tradedCurrency', 'Traded Currency', 3),
  rate('spotRate', 'Spot Rate'), rate('swapRate', 'Swap Rate'), rate('forwardRate', 'Forward Rate'),
  code('ndfFixingCurrency', 'NDF Fixing Currency', 3), { field: 'ndfFixingDate', label: 'NDF Fixing Date', type: 'date' }, code('fixingReferenceId', 'Fixing Reference ID', 30),
  code('activeStatus', 'Active Status', 1), code('activityCategory', 'Activity Category', 2)
];
const field = (f: string) => FX_TRANSACTION_FIELDS.find(d => d.field === f) as FieldDef<FxTransactionLookups>;
const HEAD = ['companyCode', 'financialTransaction', 'productType', 'transactionType', 'partner', 'activityCategory'];

export const fxTransaction: ObjectModuleDef<FxTransactionLookups> = {
  kind: 'object', id: 'fx-transaction', title: 'FX Transaction', noun: ['FX transaction', 'FX transactions'], serviceKey: 'trmfx', storageKey: 'fx-transaction',
  internal: true,
  opens: { create: 'popup', open: 'popup' },
  list: {
    entity: 'transactions', keys: ['companyCode', 'financialTransaction'],
    columns: [col('companyCode', 'Company', { code: true }), col('financialTransaction', 'Transaction', { code: true }), col('productType', 'Product Type', { code: true }), col('partner', 'Partner', { code: true }), col('valueDate', 'Value Date', { text: r => formatDate(r.valueDate) })],
    fields: FX_TRANSACTION_FIELDS,
    search: ['financialTransaction', 'partner'],
    filters: ['companyCode', 'financialTransaction', 'productType', 'transactionType', 'partner', 'valueDate', 'activityCategory'],
    sort: ['companyCode', 'financialTransaction', 'valueDate'], defaultSort: { field: 'financialTransaction', dir: 1 }, pageSizes: [100, 500]
  },
  header: HEAD.map(field),
  tabs: [{ kind: 'fields', id: 'details', label: 'Details', groups: [{ title: 'FX transaction', columns: 2, fields: FX_TRANSACTION_FIELDS.filter(d => !HEAD.includes(d.field)) }] }],
  actions: [
    { id: 'settle', label: 'Settle', sapAction: 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle', confirm: 'Settle this FX transaction in SAP.', when: h => h.activityCategory !== SETTLED_CATEGORY }
  ],
  canCreate: false, canEdit: false, canDelete: false,
  lookups: () => ({})
};
