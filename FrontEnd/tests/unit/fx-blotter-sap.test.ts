// DE6 TSF FX Blotter → SAP: Auto-create Deals books Deal 1 and Deal 2 (no Deal ID yet); Release to MO of the pair draws
// exactly one Deal ID (or reuses the one the legs carry) and writes it with status 03. The reference's SAP and middleware
// calls are stubbed here; what they send is the reference program's own and is checked live.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ created: [] as unknown[], pairs: [] as unknown[], released: [] as unknown[], failCreateAt: -1, n: 0 }));
vi.mock('@/ref/features/fx-blotter/workflow', () => ({
  createBlotterDeal: vi.fn(async (r: { companyCode?: string; entity: string }, _d: Date, o?: { traderCode?: string }) => {
    calls.created.push({ ...r, traderCodeOption: o?.traderCode });
    if (calls.created.length - 1 === calls.failCreateAt) throw new Error('FTR0/123 Partner 400000002 is not valid');
    return { companyCode: r.companyCode || r.entity, transaction: String(1000000000100 + ++calls.n) };
  }),
  releaseBlotterRows: vi.fn(async (rows: unknown[], link: unknown, _d: Date, traderCode?: string) => { calls.released.push({ rows, link, traderCode }); return rows.map(row => ({ row, ok: true })); })
}));
// ZSGTRMTR_TRADER as the middleware has it: no C28; the full name "Nidhi Singh" is C29 "Nidhi S".
vi.mock('@/ref/shared/fx/mw', async orig => ({
  ...(await orig<typeof import('@/ref/shared/fx/mw')>()),
  fxList: vi.fn(async () => [{ ZTCODE: 'C27', ZNAME: 'Antony Jerin', ZTRADER: 'Antony N' }, { ZTCODE: 'C29', ZNAME: 'Nidhi Singh', ZTRADER: 'Nidhi S' }])
}));
vi.mock('@/ref/features/fx-blotter/dealIds', async orig => ({
  ...(await orig<typeof import('@/ref/features/fx-blotter/dealIds')>()),
  createPairDealId: vi.fn(async (args: unknown) => { calls.pairs.push(args); return { dealId: '7000000099', dealType: 'FX', dealDesc: 'Nidhi S_OSIPL_2026/OGA-OSIPL' }; })
}));

import { bookAutoDeal, orderLegs, pairReleaseProblem, realDealId, releasePair, toRefRow, traderShortName } from '@/pages/fx-blotter/sap';

const NIDHI = { code: 'C28', name: 'Nidhi Singh' };
import type { BlotterRow } from '@/pages/fx-blotter/data';
import type { AutoLeg, MasterContract } from '@/ref/features/fx-blotter/types';

const mc: MasterContract = {
  mcNumber: '2000000031', origin: 'OSIPL', fxModel: 'M032', modelDesc: '', entities: ['OGA', 'OSIPL'], currPair: 'USD/INR', commodityCode: 'C112', commodityDesc: 'SOYOIL',
  mcDate: new Date(2026, 10, 1), shipStart: new Date(2026, 10, 1), shipEnd: new Date(2027, 0, 31), amtUSD: 1000000, utilizedUSD: 0, group: 'G02', portShipment: '', portDestination: '',
  currencyId: 'C01', currencyDesc: 'USD-USD-INR'
};
const leg = (l: 'Deal 1' | 'Deal 2', entity: string, bs: string): AutoLeg => ({
  leg: l, tradeDate: new Date(2026, 10, 6), valueDate: new Date(2026, 11, l === 'Deal 1' ? 8 : 9), entity, txnType: 'FWD', partner: '400000002', bs, bs2: bs === 'B' ? 'S' : 'B',
  curr1: 'USD', curr2: 'INR', amt1: 400000, amt2: 36936000, rate: 92.34, swap: 0, spot: 92.34, mode: '360T', fixingDate: null, fixRef: ''
});
const row = (p: Partial<BlotterRow>): BlotterRow => ({
  id: p.ref ?? 'r', status: 'Created', touched: true, ref: '1000000000101', dealId: '', tradeDate: '2026-11-06', company: 'OGA', bank: '400000002', txnType: 'FWD', bs1: 'Buy',
  cur1: 'USD', amount1: '400000.00', cur2: 'INR', rate: '92.340000', swap: '', valueDate: '2026-12-08', mode: '360T', accCat: '', profit: '', unit: '', fixDate: '', fixRef: '',
  mc: '2000000031', dealType: '', txnStatus: '01', trader: 'NID', ...p
});

beforeEach(() => { calls.created = []; calls.pairs = []; calls.released = []; calls.failCreateAt = -1; calls.n = 0; });

describe('Auto-create Deals books both legs in SAP without a Deal ID', () => {
  it('books Deal 1 then Deal 2 with the master contract reference and no Deal ID', async () => {
    const o = await bookAutoDeal(mc, [leg('Deal 1', 'OGA', 'B'), leg('Deal 2', 'OSIPL', 'S')], '2026-11-06', NIDHI);
    expect(o).toMatchObject({ error: '', pending: false });
    expect(o.booked.map(b => b.leg)).toEqual(['Deal 1', 'Deal 2']);
    expect(calls.created).toHaveLength(2);
    for (const r of calls.created as { dealId: string; mcRef: string; dealType: string }[]) {
      expect(r.dealId).toBe('');
      expect(r.mcRef).toBe('2000000031');
    }
    expect((calls.created as { dealType: string }[]).map(r => r.dealType)).toEqual(['Deal 1 (Auto Deal)', 'Deal 2 (Auto Deal)']);
    expect((calls.created as { entity: string; buySell: string; totalRate: number }[]).map(r => [r.entity, r.buySell, r.totalRate])).toEqual([['OGA', 'B', 92.34], ['OSIPL', 'S', 92.34]]);
    expect((calls.created as { traderCodeOption: string }[]).map(r => r.traderCodeOption)).toEqual(['C28', 'C28']);
    expect(calls.pairs).toHaveLength(0);
  });
  it('stops at a refused Deal 2 and says Deal 1 stays booked', async () => {
    calls.failCreateAt = 1;
    const o = await bookAutoDeal(mc, [leg('Deal 1', 'OGA', 'B'), leg('Deal 2', 'OSIPL', 'S')], '2026-11-06', NIDHI);
    expect(o.booked).toHaveLength(1);
    expect(o.error).toMatch(/Deal 2 was not created: .*Partner 400000002.*Deal 1 \(1000000000101\) stays booked/);
  });
});

describe('Release to MO of a pair', () => {
  const d1 = row({ ref: '1000000000101', company: 'OGA', bs1: 'Buy' });
  const d2 = row({ ref: '1000000000102', company: 'OSIPL', bs1: 'Sell', valueDate: '2026-12-09' });

  it('draws one Deal ID for the master contract, Deal 1 = the leg booked first, and writes it on both legs', async () => {
    const o = await releasePair([d2, d1], mc, '2026-11-06', NIDHI);
    expect(o).toEqual({ dealId: '7000000099', created: true, errors: [] });
    expect(calls.pairs).toHaveLength(1);
    const args = calls.pairs[0] as { mc: MasterContract; legs: { transactionNumber: string; companyCode: string; mcRef: string }[]; traderName: string; year: number };
    expect(args.legs.map(l => [l.transactionNumber, l.companyCode, l.mcRef])).toEqual([['1000000000101', 'OGA', '2000000031'], ['1000000000102', 'OSIPL', '2000000031']]);
    // The code chosen on the blotter is the Deal ID's trader; the description takes the short name of ZSGTRMTR_TRADER.
    expect(args).toMatchObject({ traderName: 'Nidhi S', traderCode: 'C28', year: 2026 });
    expect((calls.released[0] as { traderCode: string }).traderCode).toBe('C28');
    const rel = calls.released[0] as { rows: { dealId: string; dealType: string }[]; link: unknown };
    expect(rel.link).toEqual({ dealId: '7000000099', mcRef: '2000000031', dealDesc: 'Nidhi S_OSIPL_2026/OGA-OSIPL' });
    expect(rel.rows.map(r => [r.dealId, r.dealType])).toEqual([['7000000099', 'Deal 1'], ['7000000099', 'Deal 2']]);
  });
  it('releases legs that already carry a Deal ID without drawing a second one', async () => {
    const o = await releasePair([{ ...d1, dealId: '7000000088' }, { ...d2, dealId: '7000000088' }], undefined, '2026-11-06', NIDHI);
    expect(o).toEqual({ dealId: '7000000088', created: false, errors: [] });
    expect(calls.pairs).toHaveLength(0);
    expect((calls.released[0] as { link: unknown }).link).toEqual({ dealId: '7000000088', mcRef: '2000000031' });
  });
  it('treats a provisional Deal ID ("TSF-12") as none, so the release draws a real one', async () => {
    expect(realDealId('TSF-12')).toBe('');
    const o = await releasePair([{ ...d1, dealId: 'TSF-12' }, { ...d2, dealId: 'TSF-12' }], mc, '2026-11-06', NIDHI);
    expect(o.dealId).toBe('7000000099');
    expect(calls.pairs).toHaveLength(1);
  });
  it('refuses what cannot be one Deal ID, before any write', async () => {
    expect(pairReleaseProblem([d1])).toBe('Select exactly two transactions.');
    expect(pairReleaseProblem([d1, { ...d2, status: 'Released' }])).toBe('Only Created transactions can be released.');
    expect(pairReleaseProblem([d1, { ...d2, ref: '' }])).toBe('Only transactions created in SAP can be released.');
    expect(pairReleaseProblem([{ ...d1, dealId: '7000000088' }, { ...d2, dealId: '7000000077' }])).toMatch(/different Deal IDs/);
    expect(pairReleaseProblem([{ ...d1, dealId: '7000000088' }, d2])).toMatch(/Only one of the two/);
    await expect(releasePair([d1, d2], undefined, '2026-11-06', NIDHI)).rejects.toThrow('Select the master contract');
    expect(calls.pairs).toHaveLength(0);
    expect(calls.released).toHaveLength(0);
  });
});

describe('the trader', () => {
  it('takes the short name by code, else by full name, else the name as shown', async () => {
    expect(await traderShortName({ code: 'C27', name: 'Antony' })).toBe('Antony N');
    expect(await traderShortName({ code: 'C28', name: 'Nidhi Singh' })).toBe('Nidhi S');
    expect(await traderShortName({ code: 'X01', name: 'Somebody New' })).toBe('Somebody New');
  });
});

describe('rows as the reference reads them', () => {
  it('maps a SAP transaction with its USD side, dates and leg', () => {
    const r = toRefRow(row({ amount1: '400000.00', rate: '92.34' }), 'Deal 2', 'Nidhi S');
    expect(r).toMatchObject({ live: true, companyCode: 'OGA', transactionNumber: '1000000000101', curr1: 'USD', amt1: 400000, dealType: 'Deal 2', mcRef: '2000000031', buySell: 'B', trader: 'NID' });
    expect(r.amt2).toBeCloseTo(36936000, 2);
    expect(r.valueDate?.getDate()).toBe(8);
  });
  it('orders legs by transaction number', () => {
    expect(orderLegs([{ ref: '1000000000102' }, { ref: '999' }, { ref: '1000000000101' }]).map(r => r.ref)).toEqual(['999', '1000000000101', '1000000000102']);
  });
});
