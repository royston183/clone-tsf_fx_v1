import { describe, expect, it } from 'vitest';
import { acceptPlan, dealRows, proposalsFor } from '@/pages/propose-tradeflows/logic';
import { sampleProposeData } from '@/pages/propose-tradeflows/data';

describe('Propose Tradeflows on sample data', async () => {
  const data = sampleProposeData();
  const [deals, bls, commodities, rates] = await Promise.all([data.deals(), data.bls(), data.commodities(), data.rates()]);
  const rows = dealRows(deals, bls, rates);
  const row = (id: string) => rows.find(r => r.dealId === id)!;

  it('converts each Deal Amount to USD and subtracts what its BLs were assigned with', () => {
    expect(row('DL26000101')).toMatchObject({ usd: '189200.00', assignedUsd: '94600.00', remainingUsd: '94600.00', status: 'Open' });
    expect(row('DL26000142')).toMatchObject({ currency: 'INR', usd: '283800.00', remainingUsd: '283800.00' });
  });
  it('marks a deal without a USD rate and gives it no proposals', () => {
    expect(row('DL26000160')).toMatchObject({ usd: null, status: 'No USD rate' });
    expect(proposalsFor(row('DL26000160'), bls, commodities, {})).toEqual([]);
  });
  it('proposes only unassigned BLs of the deal commodity within ±1% of what is left', () => {
    const found = proposalsFor(row('DL26000142'), bls, commodities, {});
    expect(found.length).toBeGreaterThan(1);
    for (const c of found) {
      expect(Math.abs(c.diffPct)).toBeLessThanOrEqual(1);
      expect(c.bls.every(no => { const b = bls.find(x => x.blNo === no)!; return b.commodity === 'ALMOND' && !b.dealId && b.deletedFlag !== 'X'; })).toBe(true);
    }
    expect(proposalsFor(row('DL26000150'), bls, commodities, {}).map(c => c.bls)).toEqual([['4000000008']]);
  });
  it('accepting stores each BL with its own USD value', () => {
    const [first] = proposalsFor(row('DL26000101'), bls, commodities, {});
    const plan = acceptPlan(first, bls);
    expect(Object.keys(plan)).toEqual(first.bls);
    expect(Object.values(plan).every(v => /^\d+\.\d{2}$/.test(v))).toBe(true);
  });
  it('the sample AI ranks by closeness and says it is not connected', async () => {
    const found = proposalsFor(row('DL26000142'), bls, commodities, {});
    const answer = await data.ai({ deal: { dealId: 'DL26000142', tsfCommodity: 'C130', dealUsd: '283800.00', remainingUsd: '283800.00' }, candidates: found, bls: [], preferences: 'max 2 BLs' });
    expect(answer.ranked[0]).toMatchObject({ reason: expect.stringContaining('AI not connected') });
    expect(answer.notUnderstood[0]).toMatch(/not connected/);
  });
});
