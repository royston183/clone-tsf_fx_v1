import { describe, expect, it } from 'vitest';
import { candidates, findCombinations, rankByCloseness, remaining, toUsd } from '@/lib/propose/match';

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
    expect(found.every(c => c.bls.length <= 8 && Math.abs(c.diffPct) <= 1)).toBe(true);
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
