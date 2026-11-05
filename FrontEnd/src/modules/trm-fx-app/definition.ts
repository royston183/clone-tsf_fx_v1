// TrmFxApp (ZSGTSFTR_APP_STR on ZFS_SB_TRMFXAPP_O4_API): the workflow state and TSF append data of an FX transaction
// (Deal ID, status, FO / MO remarks, internal reference). Keyed by company code + transaction number. Internal: the FX
// screens read it and move the status on through the data client; nothing here creates or deletes a record.
import { col } from '@/lib/grid/grid';
import type { FieldDef } from '@/lib/fields/types';
import type { ObjectModuleDef } from '../types';

export interface TrmFxAppLookups { [k: string]: never }

const text = (field: string, label: string, max: number): FieldDef<TrmFxAppLookups> => ({ field, label, type: 'text', max });
const code = (field: string, label: string, max: number): FieldDef<TrmFxAppLookups> => ({ field, label, type: 'code', max });
const flag = (field: string, label: string): FieldDef<TrmFxAppLookups> => ({ field, label, type: 'flag' });

export const TRM_FX_APP_FIELDS: FieldDef<TrmFxAppLookups>[] = [
  { ...code('companyCode', 'Company Code', 4), key: true }, { ...code('financialTransaction', 'Transaction', 13), key: true },
  code('ztsfDealType', 'Deal Type', 4), code('ztsfDealID', 'Deal ID', 15), text('ztsfDealDesc', 'Deal Description', 80), code('ztsfMcRefNo', 'MC Ref No', 10),
  code('ztsfExOptNo', 'Exercised Option No', 13), code('ztsfExSpotNo', 'Exercised Spot No', 13),
  code('ztsfBcurr', 'Buy Currency', 3), code('ztsfBhbkID', 'Buy House Bank', 5), code('ztsfBhktID', 'Buy House Bank Account', 5), code('ztsfBpayID', 'Buy Payment Details', 10),
  code('ztsfScurr', 'Sell Currency', 3), code('ztsfShbkID', 'Sell House Bank', 5), code('ztsfShktID', 'Sell House Bank Account', 5), code('ztsfSpayID', 'Sell Payment Details', 10),
  flag('ztsfExeCo', 'Execute Company'), flag('ztsfAccCo', 'Accounting Company'),
  code('ztsfRbukrs', 'Receiving Company', 4), code('ztsfRpayID', 'Receiving Payment Details', 4), code('ztsfPbukrs', 'Paying Company', 4), code('ztsfPpayID', 'Paying Payment Details', 4),
  code('ztsfTrftype', 'Transfer Type', 2), code('ztsfTrftype2', 'Transfer Type 2', 2), code('ztsfBnktype', 'Bank Type', 2), code('ztsfBnktype2', 'Bank Type 2', 2),
  code('ztsfDealSq', 'Deal Sequence', 2), flag('ztsfPreMature', 'Premature'), flag('ztsfUnwind', 'Unwind'),
  text('ndfFoRem', 'NDF FO Remark', 80), text('ndfMoRem', 'NDF MO Remark', 80), text('optFoRem', 'Option FO Remark', 80), text('optMoRem', 'Option MO Remark', 80),
  text('zolamDealNo', 'Internal Ref', 15), code('txnStatus', 'Txn Status', 2), code('ztrcode', 'Trader Code', 3), { field: 'blotterDate', label: 'Blotter Date', type: 'date' }
];
const field = (f: string) => TRM_FX_APP_FIELDS.find(d => d.field === f) as FieldDef<TrmFxAppLookups>;
const HEAD = ['companyCode', 'financialTransaction', 'ztsfDealID', 'txnStatus', 'blotterDate', 'zolamDealNo'];

export const trmFxApp: ObjectModuleDef<TrmFxAppLookups> = {
  kind: 'object', id: 'trm-fx-app', title: 'FX Transaction Workflow Data', noun: ['FX workflow record', 'FX workflow records'], serviceKey: 'trmfxapp', storageKey: 'trm-fx-app',
  internal: true,
  // One record's facts in a pop-up: no tabs, no items.
  opens: { create: 'popup', open: 'popup' },
  list: {
    entity: 'apps', keys: ['companyCode', 'financialTransaction'],
    columns: [col('companyCode', 'Company', { code: true }), col('financialTransaction', 'Transaction', { code: true }), col('ztsfDealID', 'Deal ID', { code: true }), col('txnStatus', 'Status', { code: true }), col('blotterDate', 'Blotter Date')],
    fields: TRM_FX_APP_FIELDS,
    search: ['ztsfDealID', 'financialTransaction'],
    filters: ['companyCode', 'financialTransaction', 'ztsfDealID', 'txnStatus', 'ztsfDealType', 'blotterDate'],
    sort: ['companyCode', 'financialTransaction', 'blotterDate'], defaultSort: { field: 'financialTransaction', dir: 1 }, pageSizes: [100, 500]
  },
  header: HEAD.map(field),
  tabs: [{ kind: 'fields', id: 'details', label: 'Details', groups: [{ title: 'Workflow data', columns: 2, fields: TRM_FX_APP_FIELDS.filter(d => !HEAD.includes(d.field)) }] }],
  // The FX screens move the status on and save remarks; a record is created by the Front Office blotter and never deleted here.
  canCreate: false, canDelete: false,
  lookups: () => ({})
};
