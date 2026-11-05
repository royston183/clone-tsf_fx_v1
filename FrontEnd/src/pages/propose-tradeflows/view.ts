// Propose Tradeflows: figures the screen shows (pure, tested).
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';
import type { Rules } from '@/lib/propose/match';

const cents = (v: string) => Math.round(Number(v || 0) * 100);

/** How well a proposal matches what is left: 100% minus the difference. */
export const matchPct = (diffPct: number): string => `${(100 - Math.abs(diffPct)).toFixed(1)}%`;

/** The share of a deal already assigned (0–100). */
export function progressPct(d: { usd: string | null; assignedUsd: string }): number {
  if (!d.usd || !(Number(d.usd) > 0)) return 0;
  return Math.min(100, Math.round((cents(d.assignedUsd) / cents(d.usd)) * 100));
}

/** Each BL's share of a proposal's total (whole percent). */
export function contributions(bls: { blNo: string; usdValue: string }[]): { blNo: string; pct: number }[] {
  const total = bls.reduce((s, b) => s + cents(b.usdValue), 0);
  return bls.map(b => ({ blNo: b.blNo, pct: total ? Math.round((cents(b.usdValue) / total) * 100) : 0 }));
}

/** The page header: open and filled deals, the USD still open, and the free BLs (active, unassigned, priced). */
export function kpis(deals: { status: string; remainingUsd: string }[], bls: Row[]) {
  const open = deals.filter(d => d.status === 'Open');
  const free = bls.filter(b => !str(b.dealId) && str(b.deletedFlag) !== 'X' && Number(b.usdValue) > 0);
  return {
    open: open.length,
    filled: deals.filter(d => d.status === 'Filled').length,
    openUsd: (open.reduce((s, d) => s + cents(d.remainingUsd), 0) / 100).toFixed(2),
    freeBls: free.length,
    freeUsd: (free.reduce((s, b) => s + cents(str(b.usdValue)), 0) / 100).toFixed(2)
  };
}

/** The quick preference chips of the screen. */
export const QUICK = [
  { id: 'oneBl', label: 'One BL' },
  { id: 'fewest', label: 'At most 2 BLs' },
  { id: 'older', label: 'Oldest trade flows first' },
  { id: 'fewTfs', label: 'Fewest trade flows' }
] as const;

/** The chips as rules the app applies itself (no AI needed). */
export function quickRules(ids: string[]): Rules {
  const rules: Rules = {};
  if (ids.includes('fewest')) rules.maxBls = 2;
  if (ids.includes('oneBl')) rules.maxBls = 1;
  if (ids.includes('older')) rules.preferOlder = true;
  if (ids.includes('fewTfs')) rules.preferFewerTfs = true;
  return rules;
}

/** Proposals in order: closest first; or by the preference (oldest trade flows, fewest trade flows) when one is set. */
export function orderByRules<C extends { bls: string[]; diffPct: number; tfs: number }>(list: C[], rules: Rules, bls: Map<string, { tfDate?: string }>): C[] {
  const age = (c: C) => c.bls.map(no => str(bls.get(no)?.tfDate)).sort()[0] ?? '';
  return [...list].sort((a, b) =>
    (rules.preferOlder ? age(a).localeCompare(age(b)) : 0)
    || (rules.preferNewer ? age(b).localeCompare(age(a)) : 0)
    || (rules.preferFewerTfs ? a.tfs - b.tfs : 0)
    || Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length);
}
