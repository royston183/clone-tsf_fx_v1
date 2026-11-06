// Propose Tradeflows: the filters the person's question turns into (Ask AI). The AI only reads the question into
// criteria; they are applied here, to the real deals and BLs, with exact comparisons. Pure: shared by page and tests.
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';

export type Op = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
export interface Criterion { scope: 'deal' | 'bl'; field: string; op: Op; value: string }

export interface DealFacts { dealId: string; usd: string | null; remainingUsd: string; tsfCommodity: string; tsfCommodityText: string }

export const NO_MATCH = 'No matching deals or available BLs found for the selected criteria.';

const cmp = (a: number, op: Op, b: number): boolean =>
  op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'eq' ? a === b : a !== b;
const cmpText = (a: string, op: Op, b: string): boolean => {
  const c = a < b ? -1 : a > b ? 1 : 0;
  return op === 'gt' ? c > 0 : op === 'gte' ? c >= 0 : op === 'lt' ? c < 0 : op === 'lte' ? c <= 0 : op === 'eq' ? c === 0 : c !== 0;
};
/** A value that is missing never satisfies a condition (nothing is assumed). */
const num = (v: string | null | undefined): number | null => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const isNum = (field: string) => field === 'amount' || field === 'remaining' || field === 'quantity';
const textHit = (haystack: string[], op: Op, value: string): boolean => {
  const v = value.trim().toLowerCase();
  const hit = haystack.some(h => h !== '' && (h.toLowerCase() === v || h.toLowerCase().includes(v)));
  return op === 'ne' ? !hit : hit;
};

/** Whether the deal satisfies every deal-level criterion (amounts are USD). */
export function dealMatches(d: DealFacts, criteria: Criterion[]): boolean {
  return criteria.filter(c => c.scope === 'deal').every(c => {
    if (isNum(c.field)) {
      const a = num(c.field === 'remaining' ? d.remainingUsd : d.usd);
      return a !== null && cmp(a, c.op, Number(c.value));
    }
    if (c.field === 'commodity') return textHit([d.tsfCommodity, d.tsfCommodityText], c.op, c.value);
    if (c.field === 'dealId') return textHit([d.dealId], c.op, c.value);
    return true;
  });
}

/** The BLs satisfying every BL-level criterion. `commodityText` gives a BL commodity's description. */
export function filterBls(bls: Row[], criteria: Criterion[], commodityText: (code: string) => string = () => ''): Row[] {
  const mine = criteria.filter(c => c.scope === 'bl');
  if (!mine.length) return bls;
  return bls.filter(b => mine.every(c => {
    if (isNum(c.field)) { const a = num(str(c.field === 'quantity' ? b.quantity : b.usdValue)); return a !== null && cmp(a, c.op, Number(c.value)); }
    if (c.field === 'tfDate' || c.field === 'blDate') {
      const d = str(c.field === 'tfDate' ? b.tfDate : b.blRecordDate).slice(0, 10);
      return d !== '' && cmpText(d, c.op, c.value);
    }
    if (c.field === 'commodity') return textHit([str(b.commodity), commodityText(str(b.commodity))], c.op, c.value);
    if (c.field === 'tfNo') return textHit([str(b.tfNo)], c.op, c.value);
    if (c.field === 'blNo') return textHit([str(b.blNo)], c.op, c.value);
    return true;
  }));
}

const OP_TEXT: Record<Op, string> = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', ne: '≠' };
const FIELD_TEXT: Record<string, string> = {
  amount: 'amount', remaining: 'remaining', quantity: 'quantity', commodity: 'commodity', dealId: 'Deal ID', tfDate: 'trade flow date', blDate: 'BL date', tfNo: 'trade flow', blNo: 'BL'
};
const group = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** The criteria as short chips for the screen: "Deal amount > 50,000 USD". */
export function criteriaChips(criteria: Criterion[], across = false): string[] {
  const chips = criteria.map(c => {
    const who = c.scope === 'deal' ? 'Deal' : 'BL';
    const value = isNum(c.field) ? `${group(String(Number(c.value)))}${c.field === 'quantity' ? '' : ' USD'}` : c.value;
    return `${who} ${FIELD_TEXT[c.field] ?? c.field} ${OP_TEXT[c.op]} ${value}`;
  });
  return across ? ['Across all deals', ...chips] : chips;
}
