// Pure rules of the FX Blotter: calculations, enablement, validation and Master Contract checks.
import { parseAmountInput } from '@/lib/fields/parse';
import { COMPANIES, txnTypeOf } from '@/pages/fx/sample';
import { addDays, amt, workingDay } from '@/pages/fx/format';
import { blankRow, type BlotterRow, type Mc, type Status } from './data';

export const num = (s: string): number => {
  const p = parseAmountInput(s, 2) ?? s;
  const n = Number(p);
  return Number.isFinite(n) ? n : 0;
};
export const rateNum = (s: string): number => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

const PER_100 = ['IDR', 'VND', 'TWD'];
export const quotePer = (c1: string, c2: string): number => ([c1, c2].some(c => PER_100.includes(c)) ? 100 : 1);
const baseIsFirst = (c1: string, c2: string) => c1 === 'EUR' || (c1 === 'USD' && c2 !== 'EUR');
export const defaultCur2 = (c1: string): string => (c1 === 'USD' ? 'INR' : 'USD');
export const opposite = (s: string): '' | 'Buy' | 'Sell' => (s === 'Buy' ? 'Sell' : s === 'Sell' ? 'Buy' : '');

export function amount2(r: BlotterRow): number {
  const a = num(r.amount1), x = rateNum(r.rate);
  if (!(a > 0) || !(x > 0) || !r.cur1 || !r.cur2) return 0;
  const per = quotePer(r.cur1, r.cur2);
  return baseIsFirst(r.cur1, r.cur2) ? (a * x) / per : (a * per) / x;
}
export const isForward = (type: string) => ['FWD', 'NDF', 'DNDF'].includes(type);
export const spotOf = (r: BlotterRow): number => { const x = rateNum(r.rate); return x > 0 ? (isForward(r.txnType) ? x - rateNum(r.swap) / 100 : x) : 0; };
export const isNdf = (type: string) => Boolean(txnTypeOf(type)?.ndf);
export const usdOf = (r: BlotterRow): number => (r.cur1 === 'USD' ? num(r.amount1) : r.cur2 === 'USD' ? amount2(r) : num(r.amount1));
export const pairOf = (r: BlotterRow): string => [r.cur1, r.cur2].sort().join('/');
export const defaultValueDate = (tradeDate: string, type: string): string => (tradeDate && txnTypeOf(type) ? workingDay(addDays(tradeDate, txnTypeOf(type)!.offset)) : '');

/** Apply one edit to a row with the derived fields (Curr 2, Value Date, NDF fields, Unit and Profit Center). */
export function applyEdit(r: BlotterRow, p: Partial<BlotterRow>): BlotterRow {
  const n: BlotterRow = { ...r, ...p, touched: true };
  if (p.cur1 !== undefined) n.cur2 = n.cur1 ? defaultCur2(n.cur1) : '';
  if ((p.txnType !== undefined || p.tradeDate !== undefined) && n.txnType) n.valueDate = defaultValueDate(n.tradeDate, n.txnType);
  if (p.txnType !== undefined || p.tradeDate !== undefined || p.valueDate !== undefined) {
    if (n.txnType && isNdf(n.txnType) && n.valueDate) {
      n.fixDate = addDays(n.valueDate, -2);
      if (n.txnType === 'NDF' && !n.fixRef) n.fixRef = 'FBIL';
    } else { n.fixDate = ''; n.fixRef = ''; }
  }
  if (p.txnType !== undefined && n.txnType !== 'NDF') n.fixRef = '';
  if (p.company !== undefined) {
    const c = COMPANIES.find(x => x.code === n.company);
    n.unit = c?.businessArea ?? ''; n.profit = c?.profitCenter ?? '';
  }
  return n;
}

/** Real rows first, then the blank draft lines (always `min` of them) at the bottom. */
export function normalise(rows: BlotterRow[], tradeDate: string, min = 10): BlotterRow[] {
  const real = rows.filter(r => r.touched || r.status !== 'Draft');
  const blanks = rows.filter(r => !r.touched && r.status === 'Draft').slice(0, min);
  while (blanks.length < min) blanks.push(blankRow(tradeDate));
  return [...real, ...blanks];
}
export const isBlank = (r: BlotterRow) => !r.touched && r.status === 'Draft';

export const statusTone = (s: Status): 'green' | 'amber' | 'red' | 'neutral' => (s === 'Released' ? 'green' : s === 'Created' ? 'amber' : s === 'Reversed' ? 'red' : 'neutral');

export interface Enable { create: boolean; view: boolean; release: boolean; ss: boolean; reverse: boolean; copy: boolean; del: boolean }
export function enablement(sel: BlotterRow[], locked: boolean): Enable {
  const all = (s: Status[]) => sel.length > 0 && sel.every(r => s.includes(r.status));
  return {
    create: !locked && all(['Draft']),
    view: sel.length === 1 && /^\d+$/.test(sel[0].ref),
    release: !locked && sel.length >= 1 && sel.length <= 2 && all(['Created']),
    ss: !locked && sel.length === 2 && all(['Created']),
    reverse: !locked && sel.length === 1 && all(['Created', 'Released']),
    copy: !locked && sel.length === 1,
    del: !locked && all(['Draft'])
  };
}

/** The first error of the Create Transaction validation, or null. */
export function validateCreate(rows: BlotterRow[]): string | null {
  for (const r of rows) {
    if (!(num(r.amount1) > 0)) return `${r.ref}: Amount 1 must be greater than zero.`;
    if (!(rateNum(r.rate) > 0)) return `${r.ref}: Total Rate must be greater than zero.`;
    if (!r.valueDate) return `${r.ref}: Value Date is required.`;
    if (!r.company) return `${r.ref}: Entity is required.`;
    if (!r.bank) return `${r.ref}: Business Partner is required.`;
  }
  return null;
}

const boughtCcy = (r: BlotterRow) => (r.bs1 === 'Buy' ? r.cur1 : r.cur2);
const dayDiff = (a: string, b: string) => Math.round(Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86_400_000);
export function pairIssues(a: BlotterRow, b: BlotterRow): string[] {
  const out: string[] = [];
  if (pairOf(a) !== pairOf(b)) out.push('Currency pairs do not match between the two legs.');
  else if (boughtCcy(a) === boughtCcy(b)) out.push('Both legs are on the same side (Buy/Buy or Sell/Sell) — a valid D1/D2 pair must be opposite sides of the same currency pair.');
  const d = dayDiff(a.valueDate, b.valueDate);
  if (d > 7) out.push(`Value dates are ${d} calendar day(s) apart, outside the standard ±5 working-day tolerance.`);
  return out;
}

export const mcBalance = (m: Mc): number => m.amountUsd - m.usedUsd;
export function toleranceIssue(usd: number, m: Mc): string | null {
  const bal = mcBalance(m);
  return usd > bal * 1.05 ? `Leg amount ${amt(usd)} exceeds MC balance (${amt(bal)}) plus 5% tolerance.` : null;
}
export function assignIssues(r: BlotterRow, m: Mc | undefined): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (r.valueDate < m.shipStart || r.valueDate > m.shipEnd) out.push(`Value date ${r.valueDate} is outside the Master Contract's shipping window (${m.shipStart} – ${m.shipEnd}).`);
  if (usdOf(r) > mcBalance(m) * 1.05) out.push("Amount exceeds the Master Contract's remaining balance plus tolerance.");
  return out;
}

export function lockBlock(rows: BlotterRow[]): string | null {
  if (rows.some(r => r.status === 'Created')) return 'Release all Created transactions to MO before locking the blotter.';
  if (rows.some(r => r.status === 'Draft' && r.touched)) return 'Some rows are started but not created. Create or clear them before locking the blotter.';
  return null;
}
