// MO: Execute Settlement for Deal ID: the pure rules (legs, invoices, sequence, heads-up, FX-invoice difference) and the actions against fake ports.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import type { Deal, DiffInput, FxLeg, InvLeg } from '@/pages/execute-settlement/data';
import {
  amendEndDate, completeExecution, completeInvoiceLeg, initiateSettlement, saveDifference, updateInvoiceLeg, type ActionPorts
} from '@/pages/execute-settlement/actions';
import {
  buildFxLegs, buildInvoices, computeDifferences, computeHeadsup, executionRefusal, positionFields, rowsToSave, sequenceRefusal, tradeTypeOfRef
} from '@/pages/execute-settlement/logic';

const report = (o: Row): Row => ({ companyCode: 'AE13', dealType: 'D1', rfha: '3000000000033', txnStatus: '16', statusText: 'Released to BO', partner: 'DBS', tradeDate: '2026-10-30', valueDate: '2026-11-16',
  bs1: 'Sell', curr1: 'USD', amount1: '1000', bs2: 'Buy', curr2: 'INR', amount2: '83000', spotRate: '83', allInRate: '83.1', mcRef: '2000000046', productType: '12B', transactionType: '619', reversed: 'false', ...o });
const setFxRows: Row[] = [
  { modId: 'M032', dMap: 'D1', bs: 'B', tType: 'T2P', dssDeal: 'DSS1', curr: 'USD', acc: '04', seq: '3', trfType: '04', rbukrs: 'IN11', payId: 'PAY1', bankId: 'BANK1' },
  { modId: 'M032', dMap: 'D1', bs: 'S', tType: 'T2P', dssDeal: 'DSS1', curr: 'INR', acc: '01', seq: '3', trfType: '', rbukrs: '', payId: '', bankId: '' },
  { modId: 'M032', dMap: 'D2', bs: 'B', tType: '', dssDeal: '', curr: 'INR', acc: '', seq: '', trfType: '', rbukrs: '', payId: '', bankId: '' }
];
const setTyp = (tType: string, seq: string, o: Row = {}): Row => ({ modId: 'M032', tType, seq, bukrs: 'AE13', sell: 'OGA', buy: 'DMCC', curr: 'USD', setCurr: 'USD', dMap: '', dssDeal: '', trfType: '02', fiType: '02', setDesc: `${tType} desc`, setCheck: '', postCheck: '', ...o });
const SET_TYP = [setTyp('T1-S', '6'), setTyp('T1-P', '5'), setTyp('T2-S', '4'), setTyp('T2-P', '3'), setTyp('T3-S', '2', { curr: 'INR', setCurr: 'USD', dMap: 'D2' }), setTyp('T3-P', '1', { curr: 'INR', setCurr: 'USD', dMap: 'D2' })];
const BILL_ADJ: Row[] = [
  { dealId: '7000000056', invRef: '7000000056-T1', amtUsd: '900', amt: '900', dueDate: '2026-11-20', hbkid: 'HB001', hktid: 'ACC01', bp: '0400000002', ptnrBkid: '' },
  { dealId: '7000000056', invRef: '7000000056-T3', amtUsd: '10', amt: '74700', dueDate: '2026-11-20', hbkid: '', hktid: '', bp: '', ptnrBkid: '' }
];

describe('legs', () => {
  it('reads the trade type of an invoice reference', () => {
    expect(tradeTypeOfRef('7000000023-T1')).toBe('T1');
    expect(tradeTypeOfRef('12000001-T2')).toBe('T2');
    expect(tradeTypeOfRef('nothing')).toBe('');
  });

  it('shows the Deal ID FX legs without the reversed ones, with SET_FX sequence, DSS link and the stored TrmFxApp state', () => {
    const rows = [report({}), report({ dealType: 'DSS1', rfha: '1000000000009', companyCode: 'IN11' }), report({ dealType: 'D2', rfha: '2000000000060', reversed: 'true' }), report({ dealType: 'D2', rfha: '2000000000061' })];
    const apps: Row[] = [{ companyCode: 'AE13', financialTransaction: '3000000000033', ztsfExeCo: 'X', ztsfBhbkID: 'HB1', ztsfBhktID: 'AC1', ztsfBpayID: 'BP1' }];
    const fx = buildFxLegs(rows, setFxRows, apps);
    expect(fx.map(l => `${l.type}:${l.txn}`)).toEqual(['D1:3000000000033', 'DSS1:1000000000009', 'D2:2000000000061']);
    const d1 = fx.find(l => l.type === 'D1') as FxLeg;
    expect(d1).toMatchObject({ seq: '3', dssDeal: 'DSS1', settled: true, amt1: 1000, rate: 83.1, transferType: '04', bankType: '04', typeDesc: '12B 619' });
    expect(d1.buy).toEqual({ coCode: 'IN11', bankId: 'BP1', payId: 'BANK1', house: 'HB1', account: 'AC1' });
    // the DSS leg takes the sequence of the leg it belongs to; a leg with no mapping has none
    expect(fx[1].seq).toBe('3');
    expect(fx[2].seq).toBe('');
    expect(fx.find(l => l.type === 'D2')?.settled).toBe(false);
  });

  it('builds the trade invoice legs: BIL_ADJ amounts, the stored position over them, banks and the payment amount', () => {
    const fx = buildFxLegs([report({}), report({ dealType: 'D2', rfha: '2000000000061', allInRate: '83' })], setFxRows, []);
    const positions: Row[] = [
      { dealId: '7000000056', seq: '5', tType: 'T1-P', exeCo: 'X', belnr: '4900001', hbkid: 'SND', hktid: 'S01', recHbkid: '', recHktid: '' },
      { dealId: '7000000056', seq: '6', tType: 'T1-S', exeCo: '', belnr: '', hbkid: 'SND', hktid: 'S01', recHbkid: 'RCV', recHktid: 'R01' }
    ];
    const posting: Row[] = [{ fiType: '02', docType: 'TR', xblnr1: 'X1' }];
    const inv = buildInvoices({ dealId: '7000000056', setTyp: SET_TYP, billAdj: BILL_ADJ, positions, posting, fx });
    expect(inv.map(l => `${l.seq}:${l.leg}`)).toEqual(['1:T3-P', '2:T3-S', '3:T2-P', '4:T2-S', '5:T1-P', '6:T1-S']);
    const t1p = inv.find(l => l.leg === 'T1-P') as InvLeg;
    // due date is the D1 transaction's value date; the invoice amount is the BIL_ADJ sum of the trade
    expect(t1p).toMatchObject({ invAmt: 900, due: '2026-11-16', docType: 'TR', fiDoc: '4900001', settled: true, ref: '7000000056-T1', stored: true });
    // a Payment leg shows the stored sender; the Receipt leg of the same trade has none, and its receiver falls back to the invoice's bank
    expect(t1p.senderBank).toBe('SND');
    const t1s = inv.find(l => l.leg === 'T1-S') as InvLeg;
    expect(t1s).toMatchObject({ senderBank: '', receiverBank: 'RCV', receiverAcc: 'R01', settled: false });
    const t2 = inv.find(l => l.leg === 'T2-P') as InvLeg;
    expect(t2).toMatchObject({ invAmt: 0, stored: false });
    // INR invoice settled in USD: converted at the mapped D2 deal's all-in rate
    expect(inv.find(l => l.leg === 'T3-P')).toMatchObject({ invAmt: 74700, payAmt: 900, payCur: 'USD', payReason: '' });
    const noD2 = buildInvoices({ dealId: 'x', setTyp: SET_TYP, billAdj: BILL_ADJ, positions: [], posting: [], fx: [] });
    expect(noD2.find(l => l.leg === 'T3-P')).toMatchObject({ payAmt: 0, payReason: expect.stringContaining('D2 does not exist') });
  });
});

const invLeg = (leg: string, seq: number, o: Partial<InvLeg> = {}): InvLeg => ({
  seq, leg, coCode: 'AE13', seller: 'OGA', buyer: 'DMCC', desc: `${leg} desc`, docType: 'TR', ref: '', due: '2026-11-16', invAmt: 100, invCur: 'USD', payAmt: 100, payCur: 'USD', payReason: '', fxDeal: '',
  transferType: '02', fiDoc: '', settled: false, senderBank: '', senderAcc: '', receiverBank: '', receiverAcc: '', partnerId: '', docMsg: '', dssDeal: '', fiType: '02', postDesc: '', setType: '', setCheck: false,
  postCheck: false, premAdj: '', postDate: '', stored: false, ...o
});
const fxLeg = (type: string, seq: string, o: Partial<FxLeg> = {}): FxLeg => ({
  key: `AE13-${type}`, seq, coCode: 'AE13', type, txn: `T${type}`, txnType: '605', partner: '', txnDate: '', valueDate: '2026-11-16', bs1: 'Sell', cur1: 'USD', amt1: 1000, bs2: 'Buy', cur2: 'INR', amt2: 83000, spot: 83, rate: 83,
  typeDesc: '', busArea: '', profit: '', txnStatus: '16', txnStatusText: '', mc: '', settled: false, doc1: '', doc2: '', transferType: '', bankType: '',
  buy: { coCode: '', bankId: '', payId: '', house: '', account: '' }, sell: { coCode: '', bankId: '', payId: '', house: '', account: '' }, remit: false, dssDeal: '', ...o
});
const SIX = (settled: number[]) => [['T3-P', 1], ['T3-S', 2], ['T2-P', 3], ['T2-S', 4], ['T1-P', 5], ['T1-S', 6]].map(([leg, seq]) => invLeg(leg as string, seq as number, { settled: settled.includes(seq as number) }));

describe('the settlement rules', () => {
  it('lets sequence 1 settle, and a later sequence only once the one before is settled (E052) and its FX leg (E068)', () => {
    const inv = SIX([]);
    expect(sequenceRefusal(1, inv, [], 'trade')).toBe('');
    expect(sequenceRefusal(2, inv, [], 'trade')).toBe('Sequence 1 is not settled yet: settle the legs in sequence order (E052).');
    const done = SIX([1]);
    expect(sequenceRefusal(2, done, [], 'trade')).toBe('');
    expect(sequenceRefusal(2, done, [fxLeg('D1', '1')], 'trade')).toBe('The FX deal D1 TD1 of sequence 1 is not settled yet (E068).');
    expect(sequenceRefusal('', done, [], 'trade')).toMatch(/no settlement sequence/);
    expect(sequenceRefusal('', done, [], 'fx')).toMatch(/Settle the trade invoice legs first/);
  });

  it('completes the Deal ID only with six settled trade legs (I064) and every FX leg they map to settled (I065)', () => {
    const inv = SIX([1, 2, 3, 4, 5]).map(l => (l.leg === 'T1-S' ? { ...l, fxDeal: 'D1', dssDeal: 'DSS1' } : l));
    expect(executionRefusal([], inv, false)).toBe('5 of 6 trade invoice legs are settled (I064). Not settled yet: T1-S.');
    const all = SIX([1, 2, 3, 4, 5, 6]).map(l => (l.leg === 'T1-S' ? { ...l, fxDeal: 'D1', dssDeal: 'DSS1' } : l));
    expect(executionRefusal([fxLeg('D1', '3'), fxLeg('DSS1', '3', { settled: true })], all, false)).toBe('These FX legs are not settled yet: D1 TD1 (I065).');
    expect(executionRefusal([fxLeg('D1', '3', { settled: true }), fxLeg('DSS1', '3', { settled: true })], all, false)).toBe('');
    expect(executionRefusal([fxLeg('D1', '1', { setFxBuy: { seq: '1', dssDeal: '', curr: '', acc: '', trfType: '', rbukrs: '', payId: '', bankId: '', letCode: '', letName: '', desc: '' } })], [], true)).toMatch(/I065/);
  });
});

describe('heads-up and the FX-invoice difference', () => {
  const rules: Row[] = [{ modId: 'M032', linkModel: '', noInv: '', subType: 'FX1', d1PutCall: '0', d1InvLink: '02', d1InvLink2: '01', d2PutCall: '0', d2InvLink: '03', d2InvLink2: '' }];
  const invRef: Row[] = [
    { dealId: 'D', ttype: 'T1', trdCurr: 'USD', amt: '1000', invAmt: '1000' }, { dealId: 'D', ttype: 'T2', trdCurr: 'USD', amt: '1000', invAmt: '1000' }, { dealId: 'D', ttype: 'T3', trdCurr: 'INR', amt: '1000', invAmt: '83000' }
  ];
  const billAdj: Row[] = [{ invRef: '7000000056-T1', amtUsd: '900', amt: '900' }, { invRef: '7000000056-T2', amtUsd: '1000', amt: '1000' }, { invRef: '7000000056-T3', amtUsd: '1', amt: '74700' }];
  const setSpt: Row[] = [{ sign: '+', d1Bukrs: 'OSIPL', d1Bcurr: 'USD', d2Bukrs: 'DMCC', d2Bcurr: 'INR' }, { sign: '-', d1Bukrs: 'OSIPL', d1Bcurr: 'INR', d2Bukrs: 'DMCC', d2Bcurr: 'USD' }];
  const fx = [fxLeg('D1', '3'), fxLeg('D2', '', { cur1: 'USD', txnType: '619' })];
  const inv = [invLeg('T1-S', 6, { fxDeal: 'D1', dssDeal: 'DSS1', invCur: 'USD' }), invLeg('T3-S', 2, { fxDeal: 'D2', invCur: 'INR' })];
  const input = (existing: Row[] = []): DiffInput => ({ model: 'M032', dealId: 'D', fx, inv, invRef, billAdj, rules, setSpt, tsfPay: [], existing });

  it('compares the final invoice amount with the FX deal amount, and says the action FX from SET_TYP', () => {
    const setTypRows: Row[] = [setTyp('T1-S', '6', { dssDeal: 'DSS1', sell: 'OGA', buy: 'DMCC', headFx: 'X', actfx: 'BOOK SPOT FOR' })];
    const heads = computeHeadsup({ model: 'M032', fx, rules, invRef, billAdj, setTyp: setTypRows });
    expect(heads.notice).toBe('');
    expect(heads.rows).toEqual([{ entity: 'OGA-DMCC', trade: 'T1', fxAmt: 1000, invAmt: 900, diff: 100, cur: 'USD', action: 'BOOK SPOT FOR USD 100.00' }]);
    expect(computeHeadsup({ model: 'M032', fx, rules: [{ ...rules[0], subType: 'FX2' }], invRef, billAdj, setTyp: setTypRows }).notice).toMatch(/option models/);
    expect(computeHeadsup({ model: 'M032', fx, rules: [], invRef, billAdj, setTyp: setTypRows }).notice).toMatch(/could not be found/);
  });

  it('works out the difference rows: planned, final, deal amount, spot company and Buy / Sell', () => {
    const d = computeDifferences(input());
    expect(d.map(r => [r.trade, r.cur, r.planned, r.finalInv, r.dealType, r.dealAmt, r.diff, r.spotCo, r.bs, r.saved])).toEqual([
      ['T1', 'USD', 1000, 900, 'D1', 1000, 100, 'OSIPL', 'Buy', false],
      ['T2', 'USD', 1000, 1000, 'D1', 1000, 0, 'OSIPL', 'Buy', false],
      ['T3', 'INR', 83000, 74700, 'D2', 83000, 8300, 'DMCC', 'Buy', false]
    ]);
    // a deal type saved before is not saved again
    expect(computeDifferences(input([{ dealType: 'D1' }])).filter(r => r.saved).map(r => r.trade)).toEqual(['T1', 'T2']);
  });

  it('saves the DSS-mapped leg and every non-forward FX leg, one row per key, amounts with two decimals', () => {
    const rows = rowsToSave(input(), computeDifferences(input()));
    expect(rows).toEqual([
      { modId: 'M032', dealId: 'D', dealType: 'D1', dssType: 'DSS1', bukrs: 'AE13', rfha: 'TD1', tType: 'T1', fAmt: '900.00', fxAmt: '1000.00', curr: 'USD', dAmt: '100.00', sbukrs: 'OSIPL', bs: 'Buy' },
      { modId: 'M032', dealId: 'D', dealType: 'D1', dssType: '', bukrs: '', rfha: '', tType: 'T1', fAmt: '900.00', fxAmt: '1000.00', curr: 'USD', dAmt: '100.00', sbukrs: 'OSIPL', bs: 'Buy' }
    ]);
    expect(rowsToSave(input([{ dealType: 'D1' }]), computeDifferences(input([{ dealType: 'D1' }])))).toEqual([]);
  });
});

// ------------------------------------------------------------------ the actions, against fake ports

function deal(o: Partial<Deal> = {}): Deal {
  const inv = SIX([]).map(l => ({ ...l, senderBank: '', due: '2026-11-16' }));
  const base: DiffInput = { model: 'M032', dealId: '7000000056', fx: [], inv, invRef: [], billAdj: [], rules: [], setSpt: [], tsfPay: [], existing: [] };
  return {
    id: '7000000056', dealType: 'FX', subType: 'FX1', status: '04', etag: 'W/"1"', start: '', end: '2026-12-01', revised: '', mc: '', mcDesc: '', mcDate: '', shipEnd: '', model: 'M032', modelText: '', entity: '', currencies: '',
    noInvoice: false, trader: '', statuses: [], fx: [], inv, heads: [], diffs: [], notes: [], diffInput: base, headsNotice: '', record: { dealId: '7000000056', dealType: 'FX', subType: 'FX1', status: '04', endDate: '2026-12-01' }, ...o
  };
}
function ports(fail?: 'positions' | 'status') {
  const log: { positions: Record<string, string>[][]; updates: Record<string, string>[]; spot: { rows: unknown[]; existing: Row[] }[] } = { positions: [], updates: [], spot: [] };
  let stored: Row[] = [];
  const p: ActionPorts = {
    writePositions: async (_id, rows) => { if (fail === 'positions') throw new Error('Service down'); log.positions.push(rows); },
    updateDeal: async (_d, changes) => { if (fail === 'status') throw new Error('Refused'); log.updates.push(changes); },
    readInSpot: async () => stored,
    writeInSpot: async (rows, existing) => { log.spot.push({ rows, existing }); stored = rows as unknown as Row[]; }
  };
  return { p, log };
}

describe('Initiate Settlement', () => {
  it('writes one TRD_POS row per trade leg (the whole row), then moves the Deal ID to 20', async () => {
    const { p, log } = ports();
    const r = await initiateSettlement(deal({ status: '10' }), p, '2026-11-04');
    expect(r).toEqual({ ok: true, message: 'Settlement initiated for Deal ID 7000000056: status 20 - Settlement Initiated.' });
    expect(log.positions).toHaveLength(1);
    expect(log.positions[0].map(x => `${x.seq}:${x.tType}`)).toEqual(['1:T3-P', '2:T3-S', '3:T2-P', '4:T2-S', '5:T1-P', '6:T1-S']);
    expect(log.positions[0][0]).toMatchObject({ dealId: '7000000056', rp: 'Payment', exeCo: '', belnr: '', msg: '', dueDate: '2026-11-16', pDate: '2026-11-16', amt: '100', docType: 'TR' });
    expect(log.positions[0][1].rp).toBe('Receipt');
    expect(log.updates).toEqual([{ status: '20' }]);
  });
  it('is offered from status 05 to 19 only, and says which write failed', async () => {
    const a = ports();
    expect(await initiateSettlement(deal({ status: '20' }), a.p)).toMatchObject({ ok: false, error: expect.stringContaining('only be initiated from status 05 to 19') });
    expect(await initiateSettlement(deal({ status: '04' }), a.p)).toMatchObject({ ok: false });
    expect(a.log.positions).toEqual([]);
    const b = ports('positions');
    expect(await initiateSettlement(deal({ status: '10' }), b.p)).toEqual({ ok: false, error: 'Writing the settlement legs (ZSGTSFTR_TRD_POS) failed: Service down' });
    expect(b.log.updates).toEqual([]);
    const c = ports('status');
    expect(await initiateSettlement(deal({ status: '10' }), c.p)).toEqual({ ok: false, error: 'The legs were written, but moving Deal ID 7000000056 to 20 failed: Refused' });
  });
});

describe('invoice leg Update and Settlement Complete', () => {
  const edited = (leg: InvLeg): InvLeg => ({ ...leg, senderBank: 'dbs01', senderAcc: 'acc01x', receiverBank: 'citi1', receiverAcc: 'usd01' });

  it('Update stores the banks on both legs of the trade type, from status 20 (or 05), nothing completed', async () => {
    const d = deal({ status: '20' });
    const { p, log } = ports();
    const leg = d.inv.find(l => l.leg === 'T1-P') as InvLeg;
    expect(await updateInvoiceLeg(d, leg, edited(leg), p, '2026-11-04')).toEqual({ ok: true, message: 'Bank data of T1 updated (S033).' });
    expect(log.positions[0].map(x => x.tType)).toEqual(['T1-P', 'T1-S']);
    expect(log.positions[0][0]).toMatchObject({ hbkid: 'DBS01', hktid: 'ACC01', recHbkid: 'CITI1', recHktid: 'USD01' });
    expect(log.positions[0][0]).not.toHaveProperty('exeCo');
    expect((await updateInvoiceLeg(deal({ status: '10' }), leg, edited(leg), p)).ok).toBe(false);
    expect((await updateInvoiceLeg(deal({ status: '05' }), leg, edited(leg), p)).ok).toBe(true);
  });

  it('Settlement Complete needs status 20, an unsettled leg and the previous sequence; it then sets ZEXE_CO on that leg only', async () => {
    const d = deal({ status: '20' });
    const { p, log } = ports();
    const seq3 = d.inv.find(l => l.seq === 3) as InvLeg;
    expect(await completeInvoiceLeg(d, seq3, edited(seq3), p)).toEqual({ ok: false, error: 'Sequence 2 is not settled yet: settle the legs in sequence order (E052).' });
    expect(await completeInvoiceLeg(deal({ status: '19' }), seq3, seq3, p)).toMatchObject({ ok: false, error: expect.stringContaining('Click Initiate Settlement first') });
    const first = d.inv.find(l => l.seq === 1) as InvLeg;
    expect(await completeInvoiceLeg(d, first, edited(first), p, '2026-11-04')).toMatchObject({ ok: true, message: expect.stringContaining('Sequence 1 (T3-P) settled (S051)') });
    const rows = log.positions[0];
    expect(rows.map(x => `${x.tType}:${x.exeCo ?? '-'}`)).toEqual(['T3-P:X', 'T3-S:-']);
    expect(await completeInvoiceLeg(d, { ...first, settled: true }, first, p)).toEqual({ ok: false, error: 'Sequence 1 (T3-P) is already settled.' });
  });
});

describe('Execution Complete, Amend End Date and Save Difference', () => {
  it('moves 20 to 21 once everything is settled, else says what is missing', async () => {
    const { p, log } = ports();
    expect(await completeExecution(deal({ status: '19' }), p)).toMatchObject({ ok: false, error: expect.stringContaining('Click Initiate Settlement first') });
    expect(await completeExecution(deal({ status: '20' }), p)).toMatchObject({ ok: false, error: expect.stringContaining('0 of 6 trade invoice legs are settled (I064)') });
    const done = SIX([1, 2, 3, 4, 5, 6]);
    expect(await completeExecution(deal({ status: '20', inv: done }), p)).toEqual({ ok: true, message: 'Deal ID 7000000056 is now 21 - Settlement Completed - Execution.' });
    expect(log.updates).toEqual([{ status: '21' }]);
    expect(await completeExecution(deal({ status: '20', noInvoice: true, inv: [] }), p)).toMatchObject({ ok: true });
  });

  it('amends the revised end date', async () => {
    const { p, log } = ports();
    expect((await amendEndDate(deal(), '', p)).ok).toBe(false);
    expect((await amendEndDate(deal(), '2027-01-31', p)).ok).toBe(true);
    expect(log.updates).toEqual([{ revisedEndDate: '2027-01-31' }]);
  });

  it('saves the difference rows once, and says so when there is nothing to save', async () => {
    const rules: Row[] = [{ modId: 'M032', linkModel: '', subType: 'FX1', d1PutCall: '0', d1InvLink: '02', d1InvLink2: '01', d2InvLink: '03' }];
    const diffInput: DiffInput = {
      model: 'M032', dealId: '7000000056', fx: [fxLeg('D1', '3')], inv: [invLeg('T1-S', 6, { fxDeal: 'D1', dssDeal: 'DSS1', invCur: 'USD' })],
      invRef: [{ ttype: 'T1', trdCurr: 'USD', amt: '1000', invAmt: '1000' }], billAdj: [{ invRef: '7000000056-T1', amtUsd: '900', amt: '900' }],
      rules, setSpt: [{ sign: '+', d1Bukrs: 'OSIPL', d1Bcurr: 'USD' }], tsfPay: [], existing: []
    };
    const { p, log } = ports();
    const d = deal({ diffInput });
    expect(await saveDifference(d, p)).toEqual({ ok: true, message: 'Details Saved Successfully..' });
    expect(log.spot).toHaveLength(1);
    expect(log.spot[0].rows).toHaveLength(2);
    // the second press re-reads IN_SPOT, finds the deal type saved and writes nothing
    expect(await saveDifference(d, p)).toEqual({ ok: true, message: 'Data already saved..' });
    expect(log.spot).toHaveLength(1);
  });
});

describe('positionFields', () => {
  it('takes the due date as the posting date and never stores a blank date', () => {
    const f = positionFields('D', invLeg('T1-S', 6, { due: '' }), 5, '2026-11-04');
    expect(f).toMatchObject({ seq: '6', dueDate: '2026-11-04', pDate: '2026-11-04' });
    expect(positionFields('D', invLeg('T1-S', 0), 5, '2026-11-04').seq).toBe('6');
  });
});
