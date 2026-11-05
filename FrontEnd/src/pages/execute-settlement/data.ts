// The view model of the MO Execute Settlement screen: one Deal ID with its FX legs, trade invoice legs, heads-up, FX-invoice
// difference rows and the facts of its overview. Read from the data client by live.ts; shaped by logic.ts.

import type { Row } from '@/lib/grid/types';

export const TRANSFER_TYPES: Record<string, string> = { '01': 'TT Form', '02': 'ECM', '03': 'Letter', '04': 'Indirect', '05': 'SSI Letter + ECM', '06': 'SSI Letter' };
export const BANK_TYPES: Record<string, string> = { '01': 'Bank Account', '02': 'Bank BP', '04': 'Bank Clearing' };

export interface Side { coCode: string; bankId: string; payId: string; house: string; account: string }
/** One side (buy or sell) of an FX leg's settlement mapping (ZSGTSFTR_SET_FX). */
export interface SetFxSide { seq: string; dssDeal: string; curr: string; acc: string; trfType: string; rbukrs: string; payId: string; bankId: string; letCode: string; letName: string; desc: string }
export interface FxLeg {
  /** Company code + transaction: the leg's identity. */
  key: string;
  seq: string; coCode: string; type: string; txn: string; txnType: string; partner: string; txnDate: string; valueDate: string;
  bs1: string; cur1: string; amt1: number; bs2: string; cur2: string; amt2: number; spot: number; rate: number;
  typeDesc: string; busArea: string; profit: string; txnStatus: string; txnStatusText: string; mc: string; settled: boolean; doc1: string; doc2: string;
  transferType: string; bankType: string; buy: Side; sell: Side; remit: boolean;
  dssDeal: string; setFxBuy?: SetFxSide; setFxSell?: SetFxSide;
}
export interface InvLeg {
  seq: number; leg: string; coCode: string; seller: string; buyer: string; desc: string; docType: string; ref: string; due: string;
  invAmt: number; invCur: string; payAmt: number; payCur: string; payReason: string; fxDeal: string; transferType: string; fiDoc: string; settled: boolean;
  senderBank: string; senderAcc: string; receiverBank: string; receiverAcc: string; partnerId: string; docMsg: string;
  dssDeal: string; fiType: string; postDesc: string; setType: string; setCheck: boolean; postCheck: boolean; premAdj: string; postDate: string; stored: boolean;
}
export interface HeadsUp { entity: string; trade: string; fxAmt: number; invAmt: number; diff: number; cur: string; action: string }
export interface DiffRow {
  trade: string; cur: string; planned: number; finalInv: number; dealType: string; dealAmt: number; spotCo: string; bs: string; saved: boolean;
  diff: number; deal3Type: string; deal3Amt: number; diff3: number;
}
/** What the FX-invoice difference is computed (and saved) from. */
export interface DiffInput { model: string; dealId: string; fx: readonly FxLeg[]; inv: readonly InvLeg[]; invRef: Row[]; billAdj: Row[]; rules: Row[]; setSpt: Row[]; tsfPay: Row[]; existing: Row[] }
/** One Deal ID of the picker. */
export interface DealPick { id: string; status: string; model: string; modelText: string; entity: string; desc: string; mc: string; end: string }
export interface StatusText { code: string; text: string }
export interface Deal {
  id: string; dealType: string; subType: string; status: string; etag: string; start: string; end: string; revised: string; mc: string; mcDesc: string; mcDate: string; shipEnd: string;
  model: string; modelText: string; entity: string; currencies: string; noInvoice: boolean; trader: string;
  statuses: StatusText[]; fx: FxLeg[]; inv: InvLeg[]; heads: HeadsUp[]; diffs: DiffRow[];
  /** What could not be read, one line each (shown above the grids). */
  notes: string[];
  /** What the heads-up and the FX-invoice difference are worked out from, and the note when the heads-up cannot be shown. */
  diffInput: DiffInput; headsNotice: string;
  /** The stored Deal ID record (the status update sends it whole). */
  record: Record<string, string>;
}

export const hasInvoice = (d: Deal): boolean => !d.noInvoice;
export const spaced = (s: string): string => s.split('-').join(' - ');
export const recPay = (leg: InvLeg): string => (leg.leg.charAt(3) === 'P' ? 'Payment' : leg.leg.charAt(3) === 'S' ? 'Receipt' : '');
