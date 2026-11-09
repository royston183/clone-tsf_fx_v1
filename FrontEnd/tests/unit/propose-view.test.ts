import { describe, expect, it } from 'vitest';
import { contributions, kpis, matchPct, orderByRules, progressPct, quickRules } from '@/pages/propose-tradeflows/view';

describe('Propose view helpers', () => {
  it('turns the difference into a match percentage', () => {
    expect(matchPct(0)).toBe('100.0%');
    expect(matchPct(-0.78)).toBe('99.2%');
    expect(matchPct(0.42)).toBe('99.6%');
  });
  it('shows how much of a deal is assigned, capped at 100', () => {
    expect(progressPct({ usd: '189200.00', assignedUsd: '94600.00' })).toBe(50);
    expect(progressPct({ usd: '1000', assignedUsd: '1010' })).toBe(100);
    expect(progressPct({ usd: null, assignedUsd: '0' })).toBe(0);
  });
  it('gives each BL its share of a proposal', () => {
    expect(contributions([{ blNo: 'a', usdValue: '75' }, { blNo: 'b', usdValue: '25' }])).toEqual([{ blNo: 'a', pct: 75 }, { blNo: 'b', pct: 25 }]);
  });
  it('sums the page header figures', () => {
    const deals = [
      { status: 'Open', remainingUsd: '1000.00' }, { status: 'Filled', remainingUsd: '0.00' }, { status: 'No USD rate', remainingUsd: '' }
    ];
    const bls = [{ dealId: '', deletedFlag: '', usdValue: '500.00' }, { dealId: 'D', deletedFlag: '', usdValue: '200' }, { dealId: '', deletedFlag: 'X', usdValue: '9' }, { dealId: '', deletedFlag: '', usdValue: '' }];
    expect(kpis(deals, bls)).toEqual({ open: 1, filled: 1, openUsd: '1000.00', freeBls: 1, freeUsd: '500.00' });
  });
  it('turns the quick preference chips into rules', () => {
    expect(quickRules(['fewest'])).toEqual({ maxBls: 2 });
    expect(quickRules(['oneBl', 'older'])).toEqual({ maxBls: 1, preferOlder: true });
    expect(quickRules([])).toEqual({});
  });
  it('orders proposals by closeness, or by the chosen preference', () => {
    const bls = new Map([['a', { tfDate: '2026-11-05' }], ['b', { tfDate: '2026-10-01' }], ['c', { tfDate: '2026-10-15' }]]);
    const combos = [
      { bls: ['a'], totalUsd: '100', diffPct: 0, tfs: 1 },
      { bls: ['b', 'c'], totalUsd: '100.5', diffPct: 0.5, tfs: 2 }
    ];
    expect(orderByRules(combos, {}, bls).map(c => c.bls.join(''))).toEqual(['a', 'bc']);
    expect(orderByRules(combos, { preferOlder: true }, bls).map(c => c.bls.join(''))).toEqual(['bc', 'a']);
    expect(orderByRules([...combos].reverse(), { preferFewerTfs: true }, bls).map(c => c.bls.join(''))).toEqual(['a', 'bc']);
  });
});

describe('orderByRules with "fewest BLs, bigger first"', () => {
  it('puts proposals that complete the amount first (fewest BLs), then the fullest partial fill', async () => {
    const { orderByRules } = await import('@/pages/propose-tradeflows/view');
    const c = (n: number, diffPct: number, fit?: 'under' | 'over') => ({ bls: Array.from({ length: n }, (_, i) => `${n}-${i}`), diffPct, tfs: n, fit, ...(fit === 'over' ? { cap: { blNo: 'x', usd: '1' } } : {}) });
    const order = orderByRules([c(64, -7.66, 'under'), c(65, -6.29, 'under'), c(5, 0.4), c(3, 0.9), c(2, 40, 'over')], {}, new Map(), ['fewest']);
    expect(order.map(o => [o.bls.length, o.fit ?? 'within'])).toEqual([[2, 'over'], [3, 'within'], [5, 'within'], [65, 'under'], [64, 'under']]);
  });
});
