// Types and helpers of the FX Blotter. The rows are read live (live.ts); Draft rows are kept in this page only.
import { modelOf, TXN_TYPES } from '@/pages/fx/sample';

export type Status = 'Draft' | 'Created' | 'Released' | 'Reversed';
export type Side = '' | 'Buy' | 'Sell';

export interface BlotterRow {
  id: string;
  status: Status;
  /** A Draft row that was never edited is blank (an empty line at the bottom of the grid). */
  touched: boolean;
  ref: string;
  dealId: string;
  tradeDate: string;
  company: string;
  bank: string;
  txnType: string;
  bs1: Side;
  cur1: string;
  amount1: string;
  cur2: string;
  rate: string;
  swap: string;
  valueDate: string;
  mode: string;
  accCat: string;
  profit: string;
  unit: string;
  fixDate: string;
  fixRef: string;
  mc: string;
  dealType: string;
  /** Live rows: the partner name, the SAP transaction status with its text and the trader code. */
  bankName?: string;
  txnStatus?: string;
  statusText?: string;
  trader?: string;
}

export interface Mc { mc: string; model: string; commodity: string; pair: string; entityString: string; mcDate: string; shipStart: string; shipEnd: string; amountUsd: number; usedUsd: number }
export interface OpenDeal { dealId: string; mc: string; model: string; type: string; legs: number }

export const CURRENCIES = ['USD', 'EUR', 'INR', 'SGD', 'AED', 'THB', 'VND', 'IDR', 'TWD'];
export const MODES = ['360T', 'BARX', 'Email / Phone', 'FXALL', 'JPMC', 'Pluto'];
export const ACC_CATS = ['Trading'];
export const FIX_REFS = ['FBIL', 'RBI-USDINR'];
export const DEAL_D1 = 'D1 (Paired Model)';
export const DEAL_D2 = 'D2 (Auto Deal)';
export const DEAL_SS = 'Short Straddle';
export const FIRST_RFHA = 3000000000016;
export const FIRST_DEAL = 7000000008;
export const FIRST_SS = 5000001;

let seq = 0;
export const nextId = (): string => `r${++seq}`;

export const blankRow = (tradeDate: string): BlotterRow => ({
  id: nextId(), status: 'Draft', touched: false, ref: '', dealId: '', tradeDate, company: '', bank: '', txnType: '', bs1: '', cur1: '', amount1: '',
  cur2: '', rate: '', swap: '', valueDate: '', mode: '360T', accCat: 'Trading', profit: '', unit: '', fixDate: '', fixRef: '', mc: '', dealType: ''
});

export const modelLabel = (id: string): string => `${id} - ${modelOf(id)?.text ?? ''}`;
export const typeLabel = (key: string): string => TXN_TYPES.find(t => t.key === key)?.label ?? key;
