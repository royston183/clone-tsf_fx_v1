// Every BL as Propose Tradeflows needs it (BillOfLading of ZFS_SB_TRADEFLOW_O4_API): read whole, and changed only in
// its Deal ID and the USD it was matched with (accept / unassign). Internal: no tile opens it.
import { col } from '@/lib/grid/grid';
import type { ModuleDef } from '../types';

export type BlAssignLookups = Record<string, never>;

/** Fields read (keys first). Only dealId and assignedUsd are ever changed here. */
export const BL_ASSIGN_FIELDS = ['blNo', 'blRecordDate', 'tfNo', 'tfDate', 'commodity', 'quantity', 'dealId', 'assignedUsd', 'deletedFlag'];
export const BL_ASSIGN_WRITABLE = ['dealId', 'assignedUsd'];

export const blAssign: ModuleDef<BlAssignLookups> = {
  id: 'bl-assign', title: 'BL assignment', noun: 'BLs', serviceKey: 'tradeflow', storageKey: 'tsf-bl-assign', internal: true,
  blankRows: 0, strict: true,
  // Never opened as a record: Propose Tradeflows changes BLs through its own confirm dialogs.
  opens: { create: 'popup', open: 'popup' },
  tabs: [{
    id: 'bls', label: 'BLs', title: 'BLs', noun: ['BL', 'BLs'], editable: true, keys: ['blNo', 'blRecordDate'],
    defaultSort: { col: 'blNo', dir: 1 },
    columns: [col('blNo', 'BL No', { code: true }), col('tfNo', 'TF No', { code: true }), col('dealId', 'Deal ID', { code: true })],
    search: r => [r.blNo, r.tfNo, r.dealId], filters: [],
    grid: [
      { field: 'blNo', label: 'BL No', type: 'code', max: 10, key: true },
      { field: 'blRecordDate', label: 'BL Record Date', type: 'date', key: true },
      { field: 'tfNo', label: 'TF No', type: 'code', max: 10 },
      { field: 'tfDate', label: 'TF Date', type: 'date' },
      { field: 'commodity', label: 'Commodity', type: 'code', max: 20 },
      { field: 'quantity', label: 'Quantity', type: 'decimal', scale: 3, precision: 15 },
      { field: 'dealId', label: 'Deal ID', type: 'code', max: 20 },
      { field: 'assignedUsd', label: 'Assigned USD', type: 'amount', precision: 15 },
      { field: 'deletedFlag', label: 'Deleted', type: 'code', max: 1 }
    ],
    check: () => ({})
  }],
  fields: { bls: BL_ASSIGN_FIELDS },
  lookups: () => ({})
};
