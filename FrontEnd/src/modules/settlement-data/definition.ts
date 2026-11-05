// The settlement data of MO: Execute Settlement for Deal ID (ZSGTSFR060), kept on the SLC middleware: the model's settlement
// configuration (SET_TYP, SET_FX, SET_SPT, TSF_PAY, RULE_BT, TRD_ACC), the Deal ID's invoices (INV_REF, BIL_ADJ) and the two tables
// the screen writes (TRD_POS: one row per trade invoice leg; IN_SPOT: the FX-invoice difference). A helper: no tile opens it, the page
// reads and writes it through the data client. Every table is a large tab, so it is read by filter (a Deal ID, a model), never whole.
import { col } from '@/lib/grid/grid';
import type { FieldDef } from '@/lib/fields/types';
import type { TabDef } from '@/lib/grid/types';
import type { Row } from '@/lib/grid/types';
import type { ModuleDef } from '../types';
import { BILL_ADJ, FX_MODEL, INV_REF, IN_SPOT, KEYS, SET_FX, SET_SPT, SET_TYP, TRD_ACC, TRD_POS, TSF_PAY } from './columns';

export interface SettlementLookups { statuses: Row[]; traders: Row[] }

type TableId = keyof typeof KEYS;
const labelOf = (field: string) => field.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

/** Every field is text: values travel as the service holds them, the page works with them as numbers where it must. */
const fieldsOf = (map: Record<string, string>, keys: readonly string[]): FieldDef<SettlementLookups>[] =>
  Object.keys(map).map(field => ({ field, label: labelOf(field), type: 'text', max: 255, ...(keys.includes(field) ? { key: true } : {}) }));

function tab(id: TableId, label: string, map: Record<string, string>, filters: string[], editable = false): TabDef<SettlementLookups> {
  const keys = [...KEYS[id]];
  const fields = fieldsOf(map, keys);
  const columns = keys.map(k => col(k, labelOf(k)));
  return {
    id, label, title: label, noun: [label, label], editable, keys, defaultSort: { col: keys[0], dir: 1 }, columns,
    search: r => keys.map(k => r[k]), filters: [], grid: fields, check: () => ({}),
    large: true,
    list: {
      entity: id, keys, columns, fields, search: [keys[0]], filters, sort: keys, defaultSort: { field: keys[0], dir: 1 }, pageSizes: [500]
    }
  };
}

const TABLES: Record<TableId, { label: string; map: Record<string, string>; filters: string[]; editable?: boolean }> = {
  positions: { label: 'Trade invoice settlement (TRD_POS)', map: TRD_POS, filters: ['dealId'], editable: true },
  setTyp: { label: 'Settlement: trade invoice legs (SET_TYP)', map: SET_TYP, filters: ['modId'] },
  setFx: { label: 'Settlement: FX deals (SET_FX)', map: SET_FX, filters: ['modId'] },
  billAdj: { label: 'Final invoice values (BIL_ADJ)', map: BILL_ADJ, filters: ['dealId'] },
  invRef: { label: 'Planned trade invoices (INV_REF)', map: INV_REF, filters: ['dealId'] },
  inSpot: { label: 'Invoice balance spots (IN_SPOT)', map: IN_SPOT, filters: ['dealId'], editable: true },
  setSpt: { label: 'Settlement: spot deals (SET_SPT)', map: SET_SPT, filters: ['modId'] },
  tsfPay: { label: 'Link spot deals (TSF_PAY)', map: TSF_PAY, filters: ['modId'] },
  models: { label: 'FX models (RULE_BT)', map: FX_MODEL, filters: ['modId'] },
  postingTypes: { label: 'Posting types (TRD_ACC)', map: TRD_ACC, filters: [] }
};

export const settlementData: ModuleDef<SettlementLookups> = {
  id: 'settlement-data', title: 'Settlement data', noun: 'settlement rows', serviceKey: 'settlement-data', storageKey: 'settlement-data',
  internal: true, opens: { create: 'popup', open: 'popup' }, blankRows: 0, strict: true,
  tabs: (Object.keys(TABLES) as TableId[]).map(id => tab(id, TABLES[id].label, TABLES[id].map, TABLES[id].filters, TABLES[id].editable)),
  fields: Object.fromEntries((Object.keys(TABLES) as TableId[]).map(id => [id, Object.keys(TABLES[id].map)])),
  lookups: raw => ({ statuses: raw?.statuses ?? [], traders: raw?.traders ?? [] })
};

