import { describe, expect, it } from 'vitest';
import { acceptPlan, dealRows, noProposalReason, proposalsFor } from '@/pages/propose-tradeflows/logic';
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

describe('Propose Tradeflows when nothing comes within 1%', () => {
  const commodities = [{ commodity: 'C112', tsfCommodity: 'C112' }, { commodity: 'ALMOND', tsfCommodity: 'C001' }];
  const bls = [
    { blNo: '4000000024', tfNo: '3000000025', tfDate: '2026-11-06', commodity: 'C112', quantity: '44000', usdValue: '138600.00', dealId: '', deletedFlag: '' },
    { blNo: '4000000025', tfNo: '3000000026', tfDate: '2026-11-06', commodity: 'C112', quantity: '264554.93', usdValue: '833348.03', dealId: '', deletedFlag: '' }
  ];
  const [soyoil] = dealRows([{ dealId: '7000000081', dealDesc: '', tsfCommodity: 'C112', tsfCommodityText: 'SOYOIL', amount: '100000.00', currency: 'USD' }], bls, {});
  const [rubber] = dealRows([{ dealId: '7000000078', dealDesc: '', tsfCommodity: 'C110', tsfCommodityText: 'RUBBER', amount: '600000.00', currency: 'USD' }], bls, {});

  it('proposes the closest cover and accepting caps its BL at what is left', () => {
    const [first] = proposalsFor(soyoil, bls, commodities, {});
    expect(first).toMatchObject({ fit: 'over', bls: ['4000000024'], cap: { blNo: '4000000024', usd: '100000.00' } });
    expect(acceptPlan(first, bls)).toEqual({ '4000000024': '100000.00' });
  });
  it('says why a deal gets nothing', () => {
    expect(proposalsFor(rubber, bls, commodities, {})).toEqual([]);
    expect(noProposalReason(rubber, bls, commodities, {})).toMatch(/No free, priced BL of C110 \(RUBBER\)/);
    expect(noProposalReason(soyoil, bls, commodities, { excludeTf: ['3000000025', '3000000026'] })).toMatch(/leave none of the 2 free C112 BLs/);
  });
});

describe('Propose Tradeflows: answers and assigned BLs', async () => {
  const { assignedByTradeflow } = await import('@/pages/propose-tradeflows/logic');
  const { orderByRules } = await import('@/pages/propose-tradeflows/view');
  const commodities = [{ commodity: 'C112', tsfCommodity: 'C112' }];
  const free = (blNo: string, usdValue: string, tfNo = `TF${blNo}`) => ({ blNo, tfNo, tfDate: '2026-11-06', commodity: 'C112', quantity: '1000', usdValue, dealId: '', deletedFlag: '' });
  const bls = [free('1', '138600.00'), free('2', '833348.03')];
  const [deal] = dealRows([{ dealId: '7000000081', dealDesc: '', tsfCommodity: 'C112', tsfCommodityText: 'SOYOIL', amount: '100000.00', currency: 'USD' }], bls, {});

  it('"Full BL values only" never caps a BL', () => {
    expect(proposalsFor(deal, bls, commodities, {}, { fill: ['fewest'], overflow: ['partial'] })).toEqual([]);
    expect(proposalsFor(deal, bls, commodities, {}, { fill: ['fewest'], overflow: ['cap'] })[0]).toMatchObject({ fit: 'over', cap: { usd: '100000.00' } });
  });
  it('"Fewest BLs" proposes the fewest BLs first', () => {
    const pool = [free('a', '150000'), free('b', '150000'), free('c', '100000'), free('d', '100000'), free('e', '100000')];
    const [d] = dealRows([{ dealId: 'D', dealDesc: '', tsfCommodity: 'C112', tsfCommodityText: '', amount: '300000.00', currency: 'USD' }], pool, {});
    const found = proposalsFor(d, pool, commodities, {}, { fill: ['fewest'], overflow: ['cap'] });
    const ordered = orderByRules(found, {}, new Map(pool.map(b => [b.blNo, b])), ['fewest']);
    expect(ordered[0].bls).toHaveLength(2);
  });
  it('groups a deal\'s assigned BLs by trade flow, largest first, without deleted ones', () => {
    const rows = [
      { blNo: '1', tfNo: 'T1', tfDate: '2026-11-01', quantity: '10', assignedUsd: '100.00', usdValue: '100.00', dealId: 'D1', deletedFlag: '' },
      { blNo: '2', tfNo: 'T2', tfDate: '2026-11-02', quantity: '20', assignedUsd: '300.00', usdValue: '300.00', dealId: 'D1', deletedFlag: '' },
      { blNo: '3', tfNo: 'T2', tfDate: '2026-11-02', quantity: '5', assignedUsd: '50.00', usdValue: '80.00', dealId: 'D1', deletedFlag: '' },
      { blNo: '4', tfNo: 'T1', tfDate: '2026-11-01', quantity: '5', assignedUsd: '999.00', usdValue: '999.00', dealId: 'D1', deletedFlag: 'X' },
      { blNo: '5', tfNo: 'T1', tfDate: '2026-11-01', quantity: '5', assignedUsd: '10.00', usdValue: '10.00', dealId: 'D2', deletedFlag: '' }
    ];
    const { groups, usd, count } = assignedByTradeflow('D1', rows);
    expect({ usd, count }).toEqual({ usd: '450.00', count: 3 });
    expect(groups.map(g => [g.tfNo, g.usd, g.quantity, g.bls.map(b => b.blNo)])).toEqual([['T2', '350.00', '25.000', ['2', '3']], ['T1', '100.00', '10.000', ['1']]]);
  });
  it('the sample data answers questions with a not-connected note', async () => {
    const answer = await sampleProposeData().ask({ deal: { dealId: 'D', tsfCommodity: 'C112', dealUsd: '1.00', remainingUsd: '1.00' }, candidates: [], bls: [], question: 'why?', history: [] });
    expect(answer).toMatchObject({ model: 'none', rules: {} });
    expect(answer.answer).toMatch(/not connected/);
  });
});
