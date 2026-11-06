// Propose Tradeflows: the figures of each Deal ID and the proposals for it (pure, tested).
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import { candidates, findCombinations, remaining, toUsd, TOLERANCE_PCT, type Combination, type Rules } from '@/lib/propose/match';
import { filterBls, type Criterion } from '@/lib/propose/query';
import type { Deal } from './data';

export interface DealRow extends Deal {
  /** The Deal Amount in USD (null without a rate). */
  usd: string | null;
  assignedUsd: string;
  remainingUsd: string;
  status: 'Open' | 'Filled' | 'No USD rate';
}

const cents = (v: string) => Math.round(Number(v) * 100);
const money = (c: number) => (c / 100).toFixed(2);

/** Each Deal ID with its USD amount, what its active BLs were assigned with, and what is left. */
export function dealRows(deals: Deal[], bls: Row[], rates: Record<string, string>): DealRow[] {
  return deals.map(d => {
    const usd = toUsd(d.amount, d.currency, rates);
    const mine = bls.filter(b => str(b.dealId) === d.dealId && str(b.deletedFlag) !== 'X');
    const assignedUsd = money(mine.reduce((s, b) => s + cents(str(b.assignedUsd) || '0'), 0));
    if (usd === null) return { ...d, usd, assignedUsd, remainingUsd: '', status: 'No USD rate' };
    const left = remaining(usd, mine);
    const filled = Math.abs(cents(left)) <= Math.round(cents(usd) * TOLERANCE_PCT / 100);
    return { ...d, usd, assignedUsd, remainingUsd: left, status: filled ? 'Filled' : 'Open' };
  });
}

/** The BL combinations for what is left of a Deal ID (none without a USD rate or once it is filled). */
export function proposalsFor(deal: DealRow, bls: Row[], commodities: Row[], rules: Rules, criteria: Criterion[] = []): Combination[] {
  if (deal.status !== 'Open') return [];
  const text = (code: string) => str(commodities.find(c => str(c.commodity) === code)?.description);
  return findCombinations(candidates(filterBls(bls, criteria, text), deal.tsfCommodity, commodities, rules), deal.remainingUsd, rules);
}

/**
 * The assignment checked against the LATEST BL rows, just before it is written: every BL still exists, is active, is
 * unassigned (so one BL can never go to two deals, and accepting the same proposal twice is refused), is of the deal's
 * commodity, and the deal's assigned total after this assignment stays within the tolerance of its USD amount.
 * Returns the first problem, or '' when the assignment is valid.
 */
export function checkAssignment(guard: { dealUsd: string; tsfCommodity: string; commodities: Row[] }, dealId: string, usdByBl: Record<string, string>, fresh: Row[]): string {
  const nos = Object.keys(usdByBl);
  if (!nos.length) return 'Nothing to assign.';
  const mine = new Set(guard.commodities.filter(c => str(c.tsfCommodity) && str(c.tsfCommodity) === guard.tsfCommodity).map(c => str(c.commodity)));
  for (const no of nos) {
    const b = fresh.find(r => str(r.blNo) === no);
    if (!b || str(b.deletedFlag) === 'X') return `BL ${no} no longer exists or was deleted. Refresh and propose again.`;
    if (str(b.dealId)) return str(b.dealId) === dealId ? `BL ${no} is already assigned to ${dealId}.` : `BL ${no} was just assigned to ${str(b.dealId)}. Refresh and propose again.`;
    if (!mine.has(str(b.commodity))) return `BL ${no} is not of the commodity of ${dealId}.`;
    if (!(cents(usdByBl[no]) > 0)) return `BL ${no} has no USD value.`;
  }
  const already = fresh.filter(b => str(b.dealId) === dealId && str(b.deletedFlag) !== 'X').reduce((s, b) => s + cents(str(b.assignedUsd) || '0'), 0);
  const adding = nos.reduce((s, no) => s + cents(usdByBl[no]), 0);
  const limit = cents(guard.dealUsd) + Math.round(cents(guard.dealUsd) * TOLERANCE_PCT / 100);
  if (already + adding > limit) return `Assigning these BLs would exceed ${dealId} (already assigned ${money(already)} USD, adding ${money(adding)} USD, deal ${guard.dealUsd} USD).`;
  return '';
}

/** What accepting a proposal stores: each BL with the USD value it was matched with. */
export function acceptPlan(combo: Combination, bls: Row[]): Record<string, string> {
  return Object.fromEntries(combo.bls.map(no => [no, str(bls.find(b => b.blNo === no)?.usdValue)]));
}

/** The BLs of the deal's commodity that may be proposed, and why a commodity has none (no TSF FX Commodity set). */
export function commodityNote(deal: Deal, commodities: Row[]): string {
  return commodities.some(c => str(c.tsfCommodity) === deal.tsfCommodity) ? ''
    : `No commodity in Maintain Commodity points to ${deal.tsfCommodity}${deal.tsfCommodityText ? ` (${deal.tsfCommodityText})` : ''}: set its TSF FX Commodity to get proposals.`;
}

/** The rules the AI understood, as short chips. */
const RULE_TEXT: Record<string, (v: unknown) => string> = {
  maxBls: v => `at most ${String(v)} BLs`, minBls: v => `at least ${String(v)} BLs`,
  includeTf: v => `only trade flows ${(v as string[]).join(', ')}`, excludeTf: v => `not trade flows ${(v as string[]).join(', ')}`,
  includeBl: v => `always BL ${(v as string[]).join(', ')}`, excludeBl: v => `never BL ${(v as string[]).join(', ')}`,
  preferOlder: () => 'older trade flows first', preferNewer: () => 'newer trade flows first', preferFewerTfs: () => 'fewer trade flows',
  tolerancePct: v => `within ${String(v)}%`
};
export const ruleChips = (rules: Rules): string[] => Object.entries(rules).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)).map(([k, v]) => RULE_TEXT[k]?.(v) ?? k);

