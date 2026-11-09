// Propose Tradeflows: typed conditions read into criteria (deal vs BL, strict amounts, units, BL include / exclude,
// commodities, dates) and applied to real rows only.
import { describe, expect, it } from 'vitest';
import { blUnavailable, dealMismatch, filterBls, readConditions, readDate } from '@/lib/propose/query';

const master = [
  { commodity: 'C112', description: 'SOYOIL', tsfCommodity: 'C112' },
  { commodity: 'C110', description: 'RUBBER', tsfCommodity: 'C110' },
  { commodity: 'ALMOND', description: 'Almonds', tsfCommodity: 'C001' }
];
const read = (t: string) => readConditions(t, master);

describe('amounts', () => {
  it('"greater than 50K" is strictly above 50000 and belongs to the deals across the list', () => {
    const r = read('Show deals with an amount greater than 50K');
    expect(r.criteria.scope).toBe('all');
    expect(r.criteria.deal.amount).toEqual({ op: '>', value: 50000 });
    expect(r.criteria.bl.amount).toBeUndefined();
    expect(r.notUnderstood).toEqual([]);
    expect(r.applied).toContain('deal amount > 50,000 USD');
  });
  it('"50K+" is 50000 or more', () => expect(read('deals 50K+').criteria.deal.amount).toEqual({ op: '>=', value: 50000 }));
  it('reads lakh, crore and million, and between', () => {
    expect(read('BLs above 1.5L').criteria.bl.amount).toEqual({ op: '>', value: 150000 });
    expect(read('deal amount at most 1 Cr').criteria.deal.amount).toEqual({ op: '<=', value: 10000000 });
    expect(read('BL value between 1L and 2.5M').criteria.bl.amount).toEqual({ op: 'between', value: 100000, to: 2500000 });
  });
  it('never turns a deal condition into a BL one, and refuses an amount without a subject', () => {
    const r = read('deals over 5L and BLs under 1.4L');
    expect(r.criteria.deal.amount).toEqual({ op: '>', value: 500000 });
    expect(r.criteria.bl.amount).toEqual({ op: '<', value: 140000 });
    const bare = read('amount greater than 50K');
    expect(bare.criteria.deal.amount).toBeUndefined();
    expect(bare.criteria.bl.amount).toBeUndefined();
    expect(bare.notUnderstood[0]).toMatch(/deal amount or the BL value/);
  });
  it('reads the amount left and BL quantities', () => {
    expect(read('deals with more than 1L left').criteria.deal.remaining).toEqual({ op: '>', value: 100000 });
    expect(read('BL quantity at least 44,000 LBS').criteria.bl.quantity).toEqual({ op: '>=', value: 44000 });
  });
});

describe('BLs and trade flows by number', () => {
  it('excludes, includes and limits to BLs, typed with or without the word BL', () => {
    const r = read('exclude BL 4000000024, 4000000026 and include 4000000025');
    expect(r.criteria.bl.exclude).toEqual(['4000000024', '4000000026']);
    expect(r.criteria.bl.include).toEqual(['4000000025']);
    expect(read('only 4000000027 4000000028').criteria.bl.only).toEqual(['4000000027', '4000000028']);
    expect(read('keep trade flow 3000000016 out').criteria.bl.excludeTf).toEqual(['3000000016']);
    expect(read('keep BL 4000000024 and 4000000026 out').criteria.bl.exclude).toEqual(['4000000024', '4000000026']);
    expect(read('keep trade flow 3000000016 out').notUnderstood).toEqual([]);
    expect(read('without trade flow 3000000016').criteria.bl.excludeTf).toEqual(['3000000016']);
  });
  it('reads Deal IDs as a search across deals', () => {
    const r = read('deal 7000000081');
    expect(r.criteria).toMatchObject({ scope: 'all', deal: { dealIds: ['7000000081'] } });
  });
});

describe('other conditions', () => {
  it('commodity by name or code, number of BLs, order and trade-flow dates', () => {
    const r = read('soyoil, at most 3 BLs, oldest first, trade flows after 01-11-2026');
    expect(r.criteria.commodity).toEqual(['C112']);
    expect(r.criteria.maxBls).toBe(3);
    expect(r.criteria.order).toEqual({ older: true });
    expect(r.criteria.bl.tfDate).toEqual({ from: '2026-11-01', fromStrict: true });
    expect(r.notUnderstood).toEqual([]);
  });
  it('in a month, on a day, between two days', () => {
    expect(read('trade flows in nov 2026').criteria.bl.tfDate).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(read('dated 06/11/2026').criteria.bl.tfDate).toEqual({ from: '2026-11-06', to: '2026-11-06', fromStrict: false, toStrict: false });
    expect(read('between 1 Nov 2026 and 2026-11-06').criteria.bl.tfDate).toEqual({ from: '2026-11-01', to: '2026-11-06' });
    expect(readDate('Nov 6, 2026')).toBe('2026-11-06');
  });
  it('reports what it could not read', () => {
    expect(read('prefer the blue ships').notUnderstood).toEqual(['prefer blue ships']);
  });
});

describe('applying the criteria to real rows', () => {
  const bl = (blNo: string, usdValue: string, x: Record<string, string> = {}) => ({ blNo, usdValue, tfNo: `30${blNo.slice(2)}`, tfDate: '2026-11-06', commodity: 'C112', quantity: '44000', dealId: '', deletedFlag: '', ...x });
  const bls = [bl('4000000024', '138600'), bl('4000000025', '833348.03', { tfDate: '2026-11-01' }), bl('4000000026', '94600', { commodity: 'ALMOND' }), bl('4000000027', '138600', { dealId: '7000000081' })];
  it('filters BLs by value, date, commodity and the exclude list', () => {
    expect(filterBls(bls, read('BLs above 1L').criteria, master).map(b => b.blNo)).toEqual(['4000000024', '4000000025', '4000000027']);
    expect(filterBls(bls, read('exclude 4000000024, trade flows after 05-11-2026').criteria, master).map(b => b.blNo)).toEqual(['4000000026', '4000000027']);
    expect(filterBls(bls, read('almonds').criteria, master).map(b => b.blNo)).toEqual(['4000000026']);
  });
  it('checks the deal conditions on the deal', () => {
    const deal = { dealId: '7000000081', tsfCommodity: 'C112', tsfCommodityText: 'SOYOIL', usd: '100000.00', remainingUsd: '100000.00' };
    expect(dealMismatch(deal, read('deals greater than 50K').criteria, master)).toBe('');
    expect(dealMismatch(deal, read('deals greater than 100K').criteria, master)).toMatch(/does not meet/);
    expect(dealMismatch(deal, read('deals 100K+').criteria, master)).toBe('');
    expect(dealMismatch(deal, read('rubber').criteria, master)).toMatch(/not RUBBER/);
  });
  it('says why a required BL cannot be used', () => {
    expect(blUnavailable('4000000027', bls, { dealId: '7000000099' })).toBe('BL 4000000027 is already assigned to Deal ID 7000000081.');
    expect(blUnavailable('4000000099', bls, { dealId: '7000000099' })).toBe('BL 4000000099 does not exist.');
    expect(blUnavailable('4000000024', bls, { dealId: '7000000099' })).toBe('');
  });
});
