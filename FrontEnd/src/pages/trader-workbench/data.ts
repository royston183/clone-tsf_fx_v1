// Types and rules of FO: Trader Workbench. The rows are read live (live.ts); nothing here is sample data.
export interface Deal {
  id: string; type: string; subType: string; desc: string; model: string; status: string; origin: string; mc: string;
  start: string; end: string; mcDate: string; mcCurr: string; dealCurr: string; mcAmount: number; mcAmountCurr: string;
  pl: number; plCurr: string; plRate: number; plLocal: number; localCurr: string; trader: string; traderName: string; region: string; ref: string; straddle: boolean;
  /** The status is a completed settlement ("Settlement Completed ..."): the deal is no longer open. */
  closed: boolean;
}
export interface Txn {
  id: string; dealId: string; co: string; dealType: string; txnType: string; partner: string; trade: string; value: string;
  bs1: string; cur1: string; amt1: number; bs2: string; cur2: string; amt2: number; spot: number | null; strike: number | null; allIn: number | null;
  status: string; statusText: string; ndfFixDate: string | null; ndfRate: number | null; settled: boolean; hasSpot: boolean;
  callPut?: 'Call' | 'Put'; invoiceAmt: number | null; invoiceDiff: number | null; fixRef?: string; rbiRate?: number;
  /** ZSGTSFTR_TRDWAI text of the transaction type ('' when it has no action item). */
  actionText: string;
}
export interface Option { code: string; text: string }

export const dealTone = (d: Pick<Deal, 'status' | 'closed'>): 'green' | 'amber' | 'red' => (d.closed ? 'green' : d.status === '30' ? 'red' : 'amber');

/** Transaction statuses with nothing left to do for the trader (errors, deleted, settled, offset). */
const FINAL = new Set(['00', '02', '05', '40', '49', '50', '59', '61']);
export const txnTone = (s: string): 'green' | 'amber' | 'red' => (['00', '02', '04', '05', '08', '11'].includes(s) ? 'red' : ['01', '03', '06', '07', '10', '12'].includes(s) ? 'amber' : 'green');
export const isOption = (x: Txn) => ['643', '644', '645', '646', '647', '648'].includes(x.txnType);
export type ActionKind = 'spot' | 'ndf' | 'rate';
export const actionOf = (x: Txn): ActionKind | null => (x.txnType === '619' ? 'spot' : x.txnType === '631' || x.txnType === '632' ? 'ndf' : isOption(x) ? 'rate' : null);
export const ACTION_LABEL: Record<ActionKind, string> = { spot: 'Create Settlement Spot', ndf: 'NDF Fixing', rate: 'Update Rate' };
/** An action item is waiting: the transaction has one (TRDWAI), is not final and has no settlement spot yet. */
export const isPending = (x: Txn) => actionOf(x) !== null && !x.hasSpot && !FINAL.has(x.status);
