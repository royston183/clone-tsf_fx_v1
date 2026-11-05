// Masters of the FX Trader Workbench and the FX Blotter, read from the SLC middleware (rest, read only): trader names
// (the tab) and, as lookups, the models, deal and transaction status texts, trader groups, business partners, the
// workbench action texts and the settlement spot data. Internal: no tile opens it; the two pages read it through data.ts.
import { col } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import type { ModuleDef } from '../types';

export type WbLookups = Record<string, Row[]>;

export const wbMasters: ModuleDef<WbLookups> = {
  id: 'wb-masters', title: 'FX Workbench Masters', noun: 'traders', serviceKey: 'wb-masters', storageKey: 'wb-masters-tab',
  internal: true, blankRows: 0, strict: true, opens: { create: 'popup', open: 'popup' },
  tabs: [{
    id: 'traders', label: 'Traders', title: 'Traders', noun: ['trader', 'traders'], editable: false, keys: ['code'],
    defaultSort: { col: 'code', dir: 1 },
    columns: [col('code', 'Trader Code', { code: true }), col('name', 'Name'), col('short', 'Short Name')],
    search: r => [r.code, r.name, r.short], filters: [], grid: [], check: () => ({})
  }],
  fields: { traders: ['code', 'name', 'short'] },
  lookups: raw => raw ?? {}
};
