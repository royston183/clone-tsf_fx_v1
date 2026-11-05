// Propose Tradeflows: the arithmetic of matching BLs to a Deal ID (design 2026-11-05-manage-propose-tradeflows).
// Every amount is USD and exact (integer cents). The AI only ranks what this finds and turns preferences into Rules;
// it never makes up numbers. Pure: shared by the page and the tests.
import { str } from '@/lib/grid/grid';
import type { Row } from '@/lib/grid/types';

/** What the person's preferences may say, as the AI returns them (anything else is "not understood"). */
export interface Rules {
  maxBls?: number;
  minBls?: number;
  /** Only BLs of these trade flows. */
  includeTf?: string[];
  excludeTf?: string[];
  /** These BLs must be in every combination. */
  includeBl?: string[];
  excludeBl?: string[];
  preferOlder?: boolean;
  preferNewer?: boolean;
  preferFewerTfs?: boolean;
  /** Tighter than the standard 1%, never wider. */
  tolerancePct?: number;
}
export interface Combination { bls: string[]; totalUsd: string; diffPct: number; tfs: number }

export const TOLERANCE_PCT = 1;
export const MAX_BLS = 8;
export const MAX_RESULTS = 50;
/** Search steps before giving up on finding more (keeps hundreds of BLs well under a second). */
const BUDGET = 400000;

const cents = (v: string): bigint | null => {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(str(v));
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(2, '0');
  const whole = BigInt(m[2]) * 100n + BigInt(frac.slice(0, 2));
  const round = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;
  return (whole + round) * (m[1] ? -1n : 1n);
};
const money = (c: bigint): string => {
  const neg = c < 0n, a = neg ? -c : c;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
};
const pct = (diff: bigint, target: bigint): number => (target === 0n ? 0 : Math.round(Number((diff * 1000000n) / target)) / 10000);

/** The amount in USD with the rate type M rate (`rates[currency]` = USD per unit); null when there is no rate. */
export function toUsd(amount: string, currency: string, rates: Record<string, string>): string | null {
  const a = str(amount);
  if (!/^-?\d+(\.\d+)?$/.test(a)) return null;
  const cur = str(currency).toUpperCase();
  if (cur === 'USD' || cur === '') return money(cents(a) ?? 0n);
  const rate = str(rates[cur]);
  if (!/^\d+(\.\d+)?$/.test(rate)) return null;
  // amount × rate, both decimal strings, rounded half up to cents.
  const [ai, af = ''] = a.replace('-', '').split('.'), [ri, rf = ''] = rate.split('.');
  const product = BigInt(ai + af) * BigInt(ri + rf);
  const scale = af.length + rf.length;
  const unit = scale >= 2 ? 10n ** BigInt(scale - 2) : 1n;
  const c = scale >= 2 ? (product + unit / 2n) / unit : product * 10n ** BigInt(2 - scale);
  return money(a.startsWith('-') ? -c : c);
}

/** BLs that may go to a Deal ID: active, unassigned, priced, of a commodity mapped to its TSF FX commodity. */
export function candidates(bls: Row[], tsfCommodity: string, commodities: Row[], rules: Rules): Row[] {
  const mine = new Set(commodities.filter(c => str(c.tsfCommodity) && str(c.tsfCommodity) === str(tsfCommodity)).map(c => str(c.commodity)));
  return bls.filter(b => str(b.deletedFlag) !== 'X' && !str(b.dealId) && cents(b.usdValue) !== null && (cents(b.usdValue) ?? 0n) > 0n
    && mine.has(str(b.commodity))
    && !(rules.excludeBl ?? []).includes(str(b.blNo)) && !(rules.excludeTf ?? []).includes(str(b.tfNo))
    && (!rules.includeTf?.length || rules.includeTf.includes(str(b.tfNo))));
}

/** Sets of BLs whose USD total is within the tolerance of the target: exact, bounded (≤ MAX_RESULTS, ≤ maxBls each). */
export function findCombinations(cands: Row[], targetUsd: string, rules: Rules): Combination[] {
  const target = cents(targetUsd);
  if (target === null || target <= 0n) return [];
  const tolPct = Math.min(TOLERANCE_PCT, rules.tolerancePct ?? TOLERANCE_PCT);
  const tol = (target * BigInt(Math.round(tolPct * 10000))) / 1000000n;
  const lo = target - tol, hi = target + tol;
  const maxBls = Math.max(1, Math.min(MAX_BLS, rules.maxBls ?? MAX_BLS)), minBls = Math.max(1, rules.minBls ?? 1);
  const items = cands.map(b => ({ row: b, v: cents(b.usdValue) ?? 0n })).filter(i => i.v > 0n).sort((a, b) => (b.v > a.v ? 1 : b.v < a.v ? -1 : 0));
  const required = items.filter(i => (rules.includeBl ?? []).includes(str(i.row.blNo)));
  const pool = items.filter(i => !required.includes(i));
  // suffix[i]: the sum of the largest `k` values from i on is at most suffix sum; used to cut hopeless branches.
  const suffix: bigint[] = new Array(pool.length + 1).fill(0n);
  for (let i = pool.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + pool[i].v;
  const out: Combination[] = [];
  let steps = 0;
  const chosen: typeof pool = [];
  const emit = (sum: bigint, set: typeof pool) => {
    const rows = set.map(s => s.row);
    out.push({ bls: rows.map(r => str(r.blNo)), totalUsd: money(sum), diffPct: pct(sum - target, target), tfs: new Set(rows.map(r => str(r.tfNo))).size });
  };
  const base = required.reduce((s, r) => s + r.v, 0n);
  const walk = (start: number, sum: bigint) => {
    if (out.length >= MAX_RESULTS || ++steps > BUDGET) return;
    const count = required.length + chosen.length;
    if (sum >= lo && sum <= hi && count >= minBls) emit(sum, [...required, ...chosen]);
    if (count >= maxBls) return;
    for (let i = start; i < pool.length; i++) {
      if (out.length >= MAX_RESULTS || steps > BUDGET) return;
      const next = sum + pool[i].v;
      if (next > hi) continue;                  // too big; smaller ones follow
      if (sum + suffix[i] < lo) return;          // even everything left is too little
      chosen.push(pool[i]);
      walk(i + 1, next);
      chosen.pop();
    }
  };
  if (required.length <= maxBls && base <= hi) walk(0, base);
  return out;
}

/** The fallback order without the AI: closest to the target first, then fewer BLs, then fewer trade flows. */
export function rankByCloseness(list: Combination[]): Combination[] {
  return [...list].sort((a, b) => Math.abs(a.diffPct) - Math.abs(b.diffPct) || a.bls.length - b.bls.length || a.tfs - b.tfs);
}

/** The Deal ID's USD amount minus what its active BLs were assigned with (AssignedUsd). */
export function remaining(dealUsd: string, assigned: Row[]): string {
  const total = assigned.filter(b => str(b.deletedFlag) !== 'X').reduce((s, b) => s + (cents(b.assignedUsd) ?? 0n), 0n);
  return money((cents(dealUsd) ?? 0n) - total);
}
