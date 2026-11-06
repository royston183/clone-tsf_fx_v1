import { describe, expect, it } from 'vitest';
import { criteriaChips, dealMatches, filterBls, NO_MATCH, type Criterion } from '@/lib/propose/query';
import { checkAssignment, dealRows, proposalsFor } from '@/pages/propose-tradeflows/logic';
import { sampleProposeData } from '@/pages/propose-tradeflows/data';
import { commodityPrice } from '@/modules/commodity-price/definition';
import { visibleRows } from '@/lib/grid/grid';

const gt = (value: string, scope: 'deal' | 'bl' = 'deal', field = 'amount'): Criterion => ({ scope, field, op: 'gt', value });

describe('Ask AI criteria on the real rows', async () => {
  const data = sampleProposeData();
  const [deals, bls, commodities, rates] = await Promise.all([data.deals(), data.bls(), data.commodities(), data.rates()]);
  const rows = dealRows(deals, bls, rates);

  it('"greater than 50K" is a strict comparison with 50000', () => {
    const d = (usd: string) => ({ dealId: 'D', usd, remainingUsd: usd, tsfCommodity: 'C130', tsfCommodityText: '' });
    expect(dealMatches(d('50000.00'), [gt('50000.00')])).toBe(false);
    expect(dealMatches(d('50000.01'), [gt('50000.00')])).toBe(true);
    expect(dealMatches(d('50000.00'), [{ ...gt('50000.00'), op: 'gte' }])).toBe(true);
  });
  it('a deal without a USD amount never satisfies an amount condition', () => {
    expect(dealMatches({ dealId: 'D', usd: null, remainingUsd: '', tsfCommodity: '', tsfCommodityText: '' }, [gt('1')])).toBe(false);
  });
  it('deal-level conditions never filter BLs, and BL-level conditions never filter deals', () => {
    expect(filterBls(bls, [gt('999999999')]).length).toBe(bls.length);
    const some = { dealId: 'D', usd: '10.00', remainingUsd: '10.00', tsfCommodity: 'C130', tsfCommodityText: 'ALMOND' };
    expect(dealMatches(some, [gt('999999999', 'bl', 'amount')])).toBe(true);
  });
  it('BL amount and commodity conditions keep only matching BLs, and an impossible one leaves none', () => {
    const big = filterBls(bls, [gt('90000', 'bl', 'amount')]);
    expect(big.length).toBeGreaterThan(0);
    expect(big.every(b => Number(b.usdValue) > 90000)).toBe(true);
    expect(filterBls(bls, [gt('999999999', 'bl', 'amount')])).toEqual([]);
    const almonds = filterBls(bls, [{ scope: 'bl', field: 'commodity', op: 'eq', value: 'almond' }]);
    expect(almonds.every(b => b.commodity === 'ALMOND')).toBe(true);
  });
  it('proposals are generated only from BLs that pass the BL conditions', () => {
    const deal = rows.find(r => r.dealId === 'DL26000142')!;
    const all = proposalsFor(deal, bls, commodities, {});
    const none = proposalsFor(deal, bls, commodities, {}, [gt('999999999', 'bl', 'amount')]);
    expect(all.length).toBeGreaterThan(0);
    expect(none).toEqual([]);
    expect(NO_MATCH).toBe('No matching deals or available BLs found for the selected criteria.');
  });
  it('shows the applied criteria', () => {
    expect(criteriaChips([gt('50000.00')])).toEqual(['Deal amount > 50,000 USD']);
    expect(criteriaChips([{ scope: 'bl', field: 'commodity', op: 'eq', value: 'rubber' }], true)).toEqual(['Across all deals', 'BL commodity = rubber']);
  });
});

describe('allocation is revalidated against the latest BLs', async () => {
  const data = sampleProposeData();
  const [deals, bls, commodities, rates] = await Promise.all([data.deals(), data.bls(), data.commodities(), data.rates()]);
  const deal = dealRows(deals, bls, rates).find(r => r.dealId === 'DL26000142')!;
  const [first] = proposalsFor(deal, bls, commodities, {});
  const plan = Object.fromEntries(first.bls.map(no => [no, String(bls.find(b => b.blNo === no)!.usdValue)]));
  const guard = { dealUsd: deal.usd!, tsfCommodity: deal.tsfCommodity, commodities };

  it('accepts a valid proposal once, then refuses the same proposal again (no duplicate assignment)', async () => {
    await data.assign(deal.dealId, plan, guard);
    await expect(data.assign(deal.dealId, plan, guard)).rejects.toThrow(/already assigned/);
  });
  it('refuses a BL another deal took meanwhile', () => {
    const [no] = Object.keys(plan);
    const taken = bls.map(b => (b.blNo === no ? { ...b, dealId: 'DL26000101' } : b));
    expect(checkAssignment(guard, deal.dealId, plan, taken)).toMatch(/just assigned to DL26000101/);
  });
  it('refuses a deleted or unknown BL, a wrong commodity and an over-allocation', () => {
    const [no] = Object.keys(plan);
    expect(checkAssignment(guard, deal.dealId, plan, bls.map(b => (b.blNo === no ? { ...b, deletedFlag: 'X' } : b)))).toMatch(/no longer exists/);
    expect(checkAssignment(guard, deal.dealId, { NOPE: '1.00' }, bls)).toMatch(/no longer exists/);
    expect(checkAssignment({ ...guard, tsfCommodity: 'C140' }, deal.dealId, plan, bls)).toMatch(/commodity/);
    expect(checkAssignment({ ...guard, dealUsd: '1000.00' }, deal.dealId, plan, bls)).toMatch(/exceed/);
  });
});

describe('Update Price: the Effective Date filter', () => {
  const tab = commodityPrice.tabs[0];
  const ui = (v: string) => ({ search: '', filters: (v ? { effectiveFrom: v } : {}) as Record<string, string>, columnFilters: {}, sort: tab.defaultSort, selected: [] });
  const rows = [
    { commodity: 'C110', effectiveFrom: '2026-11-06', price: '3.4000' },
    { commodity: 'C112', effectiveFrom: '2026-11-06', price: '3.1500' },
    { commodity: 'C110', effectiveFrom: '2026-11-05', price: '3.3000' },
    { commodity: 'C112', effectiveFrom: '2026-11-04T00:00:00Z', price: '3.0000' }
  ];
  it('is a date picker replacing the commodity dropdown', () => {
    expect(tab.filters).toHaveLength(1);
    expect(tab.filters[0]).toMatchObject({ id: 'effectiveFrom', kind: 'date', all: 'Effective Date' });
  });
  it('keeps only the records of the selected day, and clearing it restores all', () => {
    expect(visibleRows(tab, rows, ui('2026-11-06')).map(r => r.commodity).sort()).toEqual(['C110', 'C112']);
    expect(visibleRows(tab, rows, ui('2026-11-04')).length).toBe(1);
    expect(visibleRows(tab, rows, ui('2026-11-03'))).toEqual([]);
    expect(visibleRows(tab, rows, ui('')).length).toBe(4);
  });
});
