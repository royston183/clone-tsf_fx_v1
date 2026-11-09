import { describe, expect, it } from 'vitest';
import { assignedTotal, candidates, closestCombinations, findCombinations, findFewest, MAX_BLS, rankByCloseness, remaining, toUsd } from '@/lib/propose/match';

const bl = (blNo: string, usdValue: string, extra: Record<string, string> = {}) =>
  ({ blNo, tfNo: `TF-${blNo}`, tfDate: '2026-11-05', quantity: '1', usdValue, commodity: 'ALMOND', dealId: '', deletedFlag: '', ...extra });

describe('toUsd', () => {
  it('converts with the rate to USD and keeps USD as is', () => {
    expect(toUsd('1000000', 'INR', { INR: '0.0120' })).toBe('12000.00');
    expect(toUsd('5000.5', 'USD', {})).toBe('5000.50');
  });
  it('gives null without a rate', () => expect(toUsd('10', 'VND', { INR: '0.012' })).toBeNull());
});

describe('candidates', () => {
  const commodities = [{ commodity: 'ALMOND', tsfCommodity: 'C130' }, { commodity: 'COTTON', tsfCommodity: 'C140' }, { commodity: 'CASHEW', tsfCommodity: '' }];
  it('keeps only unassigned, active, priced BLs of the deal commodity', () => {
    const rows = [
      bl('1', '100'), bl('2', '100', { deletedFlag: 'X' }), bl('3', '100', { dealId: 'D1' }), bl('4', '', {}),
      bl('5', '100', { commodity: 'COTTON' }), bl('6', '100', { commodity: 'CASHEW' })
    ];
    expect(candidates(rows, 'C130', commodities, {}).map(r => r.blNo)).toEqual(['1']);
  });
  it('applies include and exclude rules', () => {
    const rows = [bl('1', '100'), bl('2', '100'), bl('3', '100', { tfNo: 'TFX' })];
    expect(candidates(rows, 'C130', commodities, { excludeBl: ['1'], excludeTf: ['TFX'] }).map(r => r.blNo)).toEqual(['2']);
  });
});

describe('findCombinations', () => {
  const pool = [bl('a', '5000'), bl('b', '4000'), bl('c', '3000'), bl('d', '2000')];
  it('finds every combination within ±1% of the target', () => {
    const found = findCombinations(pool, '7000', {});
    const sets = found.map(c => [...c.bls].sort().join('+'));
    expect(sets).toEqual(expect.arrayContaining(['a+d', 'b+c']));
    expect(found.every(c => Math.abs(c.diffPct) <= 1)).toBe(true);
    expect(found.find(c => [...c.bls].sort().join('+') === 'a+d')).toMatchObject({ totalUsd: '7000.00', diffPct: 0, tfs: 2 });
  });
  it('accepts a total up to 1% over or under, never more', () => {
    expect(findCombinations([bl('x', '7070')], '7000', {}).map(c => c.bls)).toEqual([['x']]);
    expect(findCombinations([bl('y', '6930')], '7000', {}).map(c => c.bls)).toEqual([['y']]);
    expect(findCombinations([bl('z', '7071')], '7000', {})).toEqual([]);
  });
  it('honours maxBls, minBls and a tighter tolerance', () => {
    const many = [bl('1', '3500'), bl('2', '3500'), bl('3', '7000'), bl('4', '6990')];
    expect(findCombinations(many, '7000', { maxBls: 1 }).every(c => c.bls.length === 1)).toBe(true);
    expect(findCombinations(many, '7000', { minBls: 2 }).every(c => c.bls.length >= 2)).toBe(true);
    expect(findCombinations(many, '7000', { maxBls: 1, tolerancePct: 0.1 }).map(c => c.bls)).toEqual([['3']]);
  });
  it('stays fast and bounded with 300 BLs', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const big = Array.from({ length: 300 }, (_, i) => bl(String(i), (1000 + Math.floor(rnd() * 90000)).toFixed(2)));
    const start = performance.now();
    const found = findCombinations(big, '250000', {});
    expect(performance.now() - start).toBeLessThan(1000);
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(50);
    expect(found.every(c => c.bls.length <= MAX_BLS && Math.abs(c.diffPct) <= 1)).toBe(true);
  });
});

describe('rankByCloseness and remaining', () => {
  it('orders by absolute difference, then fewer BLs', () => {
    const ranked = rankByCloseness([
      { bls: ['a', 'b'], totalUsd: '7010.00', diffPct: 0.14, tfs: 2 },
      { bls: ['c'], totalUsd: '7000.00', diffPct: 0, tfs: 1 },
      { bls: ['d', 'e', 'f'], totalUsd: '7000.00', diffPct: 0, tfs: 3 }
    ]);
    expect(ranked.map(c => c.bls.join(''))).toEqual(['c', 'def', 'ab']);
  });
  it('subtracts the USD stored on the active BLs of the deal', () => {
    expect(remaining('10000', [{ dealId: 'D1', assignedUsd: '2500.50', deletedFlag: '' }, { dealId: 'D1', assignedUsd: '1000', deletedFlag: 'X' }])).toBe('7499.50');
  });
});

describe('closestCombinations (nothing within 1%)', () => {
  it('offers the smallest cover with its last BL capped at what is left, once per value set', () => {
    // Deal 7000000081 on live data: 100,000 USD left; every free C112 BL is 138,600 or 833,348.03.
    const pool = [bl('24', '138600'), bl('25', '833348.03'), bl('26', '138600'), bl('27', '138600')];
    expect(findCombinations(pool, '100000', {})).toEqual([]);
    const found = closestCombinations(pool, '100000', {});
    expect(found[0]).toMatchObject({ fit: 'over', totalUsd: '138600.00', cap: { usd: '100000.00' } });
    expect(found.filter(c => c.totalUsd === '138600.00')).toHaveLength(1);
    expect(assignedTotal(found[0], '100000')).toBe('100000.00');
    expect(found.every(c => c.fit === 'over')).toBe(true);
  });
  it('caps the smallest BL of a minimal cover and offers the fullest partial fills', () => {
    const found = closestCombinations([bl('a', '6000'), bl('b', '3000'), bl('c', '500')], '8000', {});
    const cover = found.find(c => c.fit === 'over' && c.bls.join('+') === 'a+b');
    expect(cover).toMatchObject({ totalUsd: '9000.00', cap: { blNo: 'b', usd: '2000.00' } });
    expect(found.filter(c => c.fit === 'under')[0]).toMatchObject({ bls: ['a', 'c'], totalUsd: '6500.00' });
  });
  it('keeps to maxBls and gives nothing without candidates', () => {
    const found = closestCombinations([bl('a', '1000'), bl('b', '1000'), bl('c', '1000')], '2500', { maxBls: 1 });
    expect(found.every(c => c.bls.length === 1)).toBe(true);
    expect(closestCombinations([], '100', {})).toEqual([]);
  });
});

describe('large Deal IDs (many BLs in one proposal)', () => {
  // Like C110 on live data: 65 BLs of 136,680–153,000 USD each.
  const many = Array.from({ length: 65 }, (_, i) => bl(String(4000000034 + i), (136680 + (i * 251) % 16320).toFixed(2)));
  const total = many.reduce((s, b) => s + Math.round(Number(b.usdValue) * 100), 0) / 100;
  it('fills a deal larger than all BLs together with every BL (partial fill)', () => {
    const start = performance.now();
    const found = closestCombinations(many, '10000000', {});
    expect(performance.now() - start).toBeLessThan(1000);
    expect(found[0]).toMatchObject({ fit: 'under', totalUsd: total.toFixed(2) });
    expect(found[0].bls).toHaveLength(65);
  });
  it('finds a proposal of dozens of BLs within 1% when one exists', () => {
    const start = performance.now();
    const found = findCombinations(many, '5000000', {});
    expect(performance.now() - start).toBeLessThan(1000);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].bls.length).toBeGreaterThan(30);
    expect(Math.abs(found[0].diffPct)).toBeLessThanOrEqual(1);
  });
  it('covers a deal just under the total with a capped BL', () => {
    const found = closestCombinations(many, (total - 50).toFixed(2), { tolerancePct: 0.0001 });
    const cover = found.find(c => c.fit === 'over')!;
    expect(cover.bls).toHaveLength(65);
    expect(assignedTotal(cover, (total - 50).toFixed(2))).toBe((total - 50).toFixed(2));
  });
});

describe('findFewest (fewest BLs, bigger first)', () => {
  it('completes the amount with the fewest BLs, taking the largest', () => {
    const pool = [bl('a', '150000'), bl('b', '150000'), bl('c', '100000'), bl('d', '100000'), bl('e', '100000'), bl('f', '75000'), bl('g', '75000'), bl('h', '75000'), bl('i', '75000')];
    expect(findCombinations(pool, '300000', {}).some(c => c.bls.length > 2)).toBe(true);
    const found = findFewest(pool, '300000', {});
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(c => c.bls.length === 2)).toBe(true);
    expect([...found[0].bls].sort()).toEqual(['a', 'b']);
  });
  it('keeps the closest first among sets of the same size', () => {
    const found = findFewest([bl('a', '5050'), bl('b', '5000'), bl('c', '2000'), bl('d', '3000')], '5000', {});
    expect(found.map(c => c.bls)).toEqual([['b'], ['a']]);
  });
  it('needs 4 of the live C110 BLs for 600,000 USD and stays fast with 65 BLs', () => {
    const many = Array.from({ length: 65 }, (_, i) => bl(String(4000000034 + i), (136680 + (i * 251) % 16320).toFixed(2)));
    const start = performance.now();
    const found = findFewest(many, '600000', {});
    expect(performance.now() - start).toBeLessThan(1000);
    expect(found[0].bls).toHaveLength(4);
    expect(Math.abs(found[0].diffPct)).toBeLessThanOrEqual(1);
  });
  it('respects maxBls and gives nothing when no set fits', () => {
    expect(findFewest([bl('a', '100'), bl('b', '100')], '1000', {})).toEqual([]);
    expect(findFewest([bl('a', '500'), bl('b', '500')], '1000', { maxBls: 1 })).toEqual([]);
  });
});

describe('closest proposals first (tightening search)', () => {
  // Live-like C110 BLs: 65 values between 136,680 and 153,000 USD; 600,000 USD left on the deal.
  const many = Array.from({ length: 65 }, (_, i) => bl(String(4000000034 + i), (136680 + (i * 251) % 16320).toFixed(2)));
  it('finds a combination within 0.05% instead of stopping near the 1% edge', async () => {
    const { findTight } = await import('@/lib/propose/match');
    const edge = findCombinations(many, '600000', { maxBls: 4 });
    const tight = findTight(many, '600000', { maxBls: 4 });
    expect(Math.abs(tight[0].diffPct)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(tight[0].diffPct)).toBeLessThanOrEqual(Math.min(...edge.map(c => Math.abs(c.diffPct))));
    expect(findFewest(many, '600000', {})[0].bls).toHaveLength(4);
    expect(Math.abs(findFewest(many, '600000', {})[0].diffPct)).toBeLessThanOrEqual(0.05);
  });
});
