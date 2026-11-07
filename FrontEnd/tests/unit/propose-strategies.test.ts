// Each "Fill with" option searches its own way, so the options give different proposals; and every search stays fast on a
// commodity with 1,000 free BLs (the size of the DS4 test data: ~3,500 BLs over four commodities).
import { describe, expect, it } from 'vitest';
import { blAge, findFewest, findOldest, findTight, closestCombinations } from '@/lib/propose/match';
import { dealRows, proposalsFor } from '@/pages/propose-tradeflows/logic';
import { orderByRules } from '@/pages/propose-tradeflows/view';

let seed = 7;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
// 1,000 BLs of 2,000–60,000 LBS at 2.00 USD (every 10th a round 10,000 LBS), trade flows numbered in creation order.
const pool = Array.from({ length: 1000 }, (_, i) => {
  const lbs = i % 10 === 0 ? 10000 : 2000 + Math.floor(rnd() * 58000);
  return { blNo: String(4000100000 + i), tfNo: String(3000100000 + i), tfDate: '2026-11-07', commodity: 'COFARABICA', quantity: String(lbs), usdValue: (lbs * 2).toFixed(2), dealId: '', deletedFlag: '' };
});
const byNo = new Map(pool.map(b => [b.blNo, b]));
const timed = <T>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };
const newest = (bls: string[]) => bls.map(n => blAge(byNo.get(n)!)).sort().at(-1)!;

describe('each fill option gives its own proposals', () => {
  it.each(['100000', '400000', '1000000'])('for %s USD: fewest uses fewest BLs, closest is closest, oldest uses older BLs', target => {
    const [fewest, t1] = timed(() => findFewest(pool, target, {}));
    const [closest, t2] = timed(() => findTight(pool, target, {}));
    const [oldest, t3] = timed(() => findOldest(pool, target, {}));
    for (const t of [t1, t2, t3]) expect(t).toBeLessThan(1500);
    expect(fewest.length && closest.length && oldest.length).toBeTruthy();
    expect(fewest[0].bls.length).toBeLessThanOrEqual(Math.min(...closest.map(c => c.bls.length)));
    expect(Math.abs(closest[0].diffPct)).toBeLessThanOrEqual(Math.abs(fewest[0].diffPct));
    expect(newest(oldest[0].bls) <= newest(fewest[0].bls)).toBe(true);
    // Different options, different best proposals.
    expect(new Set([fewest[0], closest[0], oldest[0]].map(c => [...c.bls].sort().join('+'))).size).toBeGreaterThan(1);
  });

  it('"Oldest trade flows" offers a choice, oldest-made first', () => {
    const found = findOldest(pool, '400000', {});
    expect(found.length).toBeGreaterThan(1);
    for (let i = 1; i < found.length; i++) expect(newest(found[i - 1].bls) <= newest(found[i].bls)).toBe(true);
  });

  it('a deal far larger than all BLs gets the fullest partial fill, quickly', () => {
    const [found, t] = timed(() => closestCombinations(pool, '160000000', {}));
    expect(t).toBeLessThan(2000);
    expect(found[0].fit).toBe('under');
  });

  it('on the page: choosing "Oldest trade flows" instead of "Fewest BLs" changes the best proposal', () => {
    const [deal] = dealRows([{ dealId: '7000000007', dealDesc: '', tsfCommodity: 'C132', tsfCommodityText: 'Coffee Arabica', amount: '400000.00', currency: 'USD' }], pool, {});
    const master = [{ commodity: 'COFARABICA', description: 'Coffee Arabica', tsfCommodity: 'C132' }];
    const best = (fill: ('fewest' | 'closest' | 'oldest')[]) => orderByRules(proposalsFor(deal, pool, master, {}, { fill, overflow: ['cap', 'partial'] }), {}, byNo, fill)[0];
    const f = best(['fewest']), o = best(['oldest']), c = best(['closest']);
    expect([...f.bls].sort().join('+')).not.toBe([...o.bls].sort().join('+'));
    expect(newest(o.bls) < newest(f.bls)).toBe(true);
    expect(Math.abs(c.diffPct)).toBeLessThanOrEqual(Math.abs(f.diffPct));
  });
});
