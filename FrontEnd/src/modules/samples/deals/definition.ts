// src/modules/samples/deals/definition.ts
// Gallery sample (T-large-list, T-object): deals with cash flows on generated sample data (never SAP in the app).
import { col } from '@/lib/grid/grid';
import { formatAmount, formatDate } from '@/lib/fields/parse';
import type { FieldDef } from '@/lib/fields/types';
import type { LookupItem, Option } from '@/lib/grid/types';
import type { ObjectModuleDef } from '../../types';
import { COUNTERPARTIES, CURRENCIES, PRODUCTS } from '../lookups';

export interface DealLookups { products: Option[]; counterparties: LookupItem[]; currencies: LookupItem[] }
const STATUS: Option[] = [{ value: 'N', label: 'New' }, { value: 'R', label: 'Released' }];
export const FLOW_TYPES: Option[] = [{ value: 'INT', label: 'INT Interest' }, { value: 'REP', label: 'REP Repayment' }, { value: 'FEE', label: 'FEE Fee' }];
const statusText = (v: string | undefined) => (v === 'R' ? 'Released' : 'New');
const textOf = (items: LookupItem[], code: string) => items.find(i => i.CODE === code)?.TEXT ?? '';

const deal: FieldDef<DealLookups> = { field: 'deal', label: 'Deal *', type: 'code', max: 10, key: true, mono: true };
const name: FieldDef<DealLookups> = { field: 'name', label: 'Deal Name *', type: 'text', max: 60, required: true };
const product: FieldDef<DealLookups> = { field: 'product', label: 'Product Type *', type: 'select', options: lk => lk.products, required: true };
const counterparty: FieldDef<DealLookups> = { field: 'counterparty', label: 'Counterparty *', type: 'suggest', lookup: lk => lk.counterparties, valueHelp: true, max: 10, required: true };
const amount: FieldDef<DealLookups> = { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', precision: 15, required: true };
const currency: FieldDef<DealLookups> = { field: 'currency', label: 'Currency *', type: 'suggest', lookup: lk => lk.currencies, valueHelp: true, max: 3, required: true };

const FLOW_GRID: FieldDef<DealLookups>[] = [
  { field: 'seq', label: 'No. *', type: 'integer', max: 3, key: true, required: true },
  { field: 'payDate', label: 'Payment Date *', type: 'date', required: true },
  { field: 'flowType', label: 'Flow Type *', type: 'select', options: FLOW_TYPES, required: true, width: 150 },
  { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', precision: 15, required: true },
  { field: 'currency', label: 'Currency *', type: 'suggest', lookup: lk => lk.currencies, valueHelp: true, max: 3, required: true }
];

export const deals: ObjectModuleDef<DealLookups> = {
  kind: 'object', id: 'sample-deals', title: 'Deals', noun: ['Deal', 'Deals'], serviceKey: 'samples', storageKey: 'smui-sample-deals', devOnly: true,
  opens: { create: 'popup', open: 'popup' },
  keyBySap: true,
  list: {
    entity: 'deals', keys: ['deal'],
    columns: [
      col('deal', 'Deal', { code: true }), col('name', 'Deal Name', { bold: true }),
      col('product', 'Product Type', { text: r => PRODUCTS.find(p => p.value === r.product)?.label ?? r.product }),
      col('counterparty', 'Counterparty', { text: r => `${r.counterparty} - ${textOf(COUNTERPARTIES, r.counterparty)}` }),
      col('amount', 'Amount', { text: r => formatAmount(r.amount) }), col('currency', 'Currency'),
      col('start', 'Valid From', { text: r => formatDate(r.start) }), col('status', 'Status', { text: r => statusText(r.status), statusTone: r => r.status === 'R' ? 'green' : 'amber' })
    ],
    fields: [deal, name, product, counterparty, amount, currency, { field: 'start', label: 'Valid From', type: 'date' }, { field: 'status', label: 'Status', type: 'select', options: STATUS }],
    search: ['deal', 'name'], filters: ['product', 'currency', 'start', 'amount', 'status'], sort: ['deal', 'name', 'amount', 'start'],
    defaultSort: { field: 'deal', dir: -1 }, pageSizes: [50, 100, 200], layouts: {}
  },
  header: [deal, name, product, counterparty, amount, currency],
  tabs: [
    { kind: 'fields', id: 'basic', label: 'Basic Data', groups: [
      { title: 'Terms', columns: 2, fields: [{ field: 'start', label: 'Validity *', type: 'dateRange', toField: 'end', required: true }, { field: 'rate', label: 'Interest Rate %', type: 'decimal', scale: 4, precision: 7 }] },
      { title: 'Notes', fields: [{ field: 'remarks', label: 'Remarks', type: 'textarea', max: 255 }, { field: 'statusText', label: 'Status', type: 'display', computed: r => statusText(r.status), statusTone: r => r.status === 'R' ? 'green' : 'amber' }] }
    ] },
    { kind: 'items', id: 'flows', label: 'Cash Flows', table: 'flows', keys: ['deal', 'seq'], editable: true, grid: FLOW_GRID,
      columns: [
        col('seq', 'No.'), col('payDate', 'Payment Date', { text: r => formatDate(r.payDate) }),
        col('flowType', 'Flow Type', { text: r => FLOW_TYPES.find(t => t.value === r.flowType)?.label ?? r.flowType }),
        col('amount', 'Amount', { text: r => formatAmount(r.amount) }), col('currency', 'Currency')
      ] }
  ],
  defaults: () => ({ product: '51A', currency: 'INR' }),
  check: (header, items) => ({
    header: {},
    items: { flows: (items.flows ?? []).flatMap((r, i) => (r.payDate && header.start && r.payDate < header.start ? [{ row: i + 1, field: 'payDate', message: 'Payment Date must not be before the deal starts.' }] : [])) },
    messages: []
  }),
  actions: [{
    id: 'release', label: 'Release', sapAction: 'com.sap.gateway.srvd_a2x.zfs_sd_sampledeal.v0001.Release',
    confirm: 'Release this deal? A released deal is ready for posting.', when: h => h.status !== 'R', mock: h => ({ ...h, status: 'R' })
  }],
  lookups: () => ({ products: PRODUCTS, counterparties: COUNTERPARTIES, currencies: CURRENCIES })
};
