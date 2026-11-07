// Propose Tradeflows acceptance scenarios: conditions filter real deals and BLs only; no unrelated fallback; fully
// allocated BLs never proposed; acceptance re-checked against fresh BLs (duplicates, over-allocation, repeats refused).
import { describe, expect, it } from 'vitest';
import { dealMismatch, readConditions } from '@/lib/propose/query';
import { assignmentProblems, dealRows, DEFAULT_ANSWERS, distinctProposals, NO_MATCH, proposalsUnder } from '@/pages/propose-tradeflows/logic';
import { sampleProposeData } from '@/pages/propose-tradeflows/data';

const master = [{ commodity: 'C112', description: 'SOYOIL', tsfCommodity: 'C112' }, { commodity: 'C110', description: 'RUBBER', tsfCommodity: 'C110' }];
const bl = (blNo: string, usdValue: string, x: Record<string, string> = {}) => ({ blNo, tfNo: `30${blNo.slice(2)}`, tfDate: '2026-11-06', commodity: 'C112', quantity: '44000', usdValue, dealId: '', assignedUsd: '', deletedFlag: '', ...x });
const bls = [
  bl('4000000024', '138600.00'), bl('4000000025', '200000.00'), bl('4000000026', '61400.00'), bl('4000000027', '100000.00', { tfDate: '2026-11-01' }),
  bl('4000000028', '100000.00', { dealId: '7000000050', assignedUsd: '100000.00' }), // fully allocated to another deal
  bl('4000000029', '100000.00', { deletedFlag: 'X' })
];
const deals = dealRows([
  { dealId: '7000000081', dealDesc: '', tsfCommodity: 'C112', tsfCommodityText: 'SOYOIL', amount: '200000.00', currency: 'USD' },
  { dealId: '7000000082', dealDesc: '', tsfCommodity: 'C112', tsfCommodityText: 'SOYOIL', amount: '40000.00', currency: 'USD' },
  { dealId: '7000000078', dealDesc: '', tsfCommodity: 'C110', tsfCommodityText: 'RUBBER', amount: '600000.00', currency: 'USD' }
], bls, {});
const [d81] = deals;
const under = (text: string, answers = DEFAULT_ANSWERS) => proposalsUnder(d81, bls, master, readConditions(text, master).criteria, answers);

describe('conditions on deals', () => {
  it('"Show deals with an amount greater than 50K" keeps only deals strictly above 50000', () => {
    const c = readConditions('Show deals with an amount greater than 50K', master).criteria;
    expect(deals.filter(d => !dealMismatch(d, c, master)).map(d => d.dealId)).toEqual(['7000000081', '7000000078']);
  });
  it('commodity and amount together return only the deals matching both', () => {
    const c = readConditions('show soyoil deals above 50K', master).criteria;
    expect(deals.filter(d => !dealMismatch(d, c, master)).map(d => d.dealId)).toEqual(['7000000081']);
  });
  it('a selected deal that fails a deal condition gets no proposal and the no-match message', () => {
    const r = under('deals above 5L');
    expect(r.proposals).toEqual([]);
    expect(r.reason.startsWith(NO_MATCH)).toBe(true);
  });
});

describe('conditions on BLs', () => {
  it('uses only BLs that satisfy them, and fully allocated or deleted BLs never', () => {
    const r = under('BLs at most 1.4L');
    expect(r.reason).toBe('');
    const used = new Set(r.proposals.flatMap(p => p.bls));
    expect(used.size).toBeGreaterThan(0);
    expect([...used].every(no => ['4000000024', '4000000026', '4000000027'].includes(no))).toBe(true);
  });
  it('excludes and includes BLs as typed', () => {
    const ex = under('exclude 4000000025').proposals;
    expect(ex.length).toBeGreaterThan(0);
    expect(ex.every(p => !p.bls.includes('4000000025'))).toBe(true);
    const inc = under('include BL 4000000024').proposals;
    expect(inc.length).toBeGreaterThan(0);
    expect(inc.every(p => p.bls.includes('4000000024'))).toBe(true);
  });
  it('a required BL that is taken stops the proposals with the reason', () => {
    expect(under('include BL 4000000028')).toEqual({ proposals: [], reason: `${NO_MATCH} BL 4000000028 is already assigned to Deal ID 7000000050.` });
  });
  it('conditions that leave nothing give the no-match message, not unrelated proposals', () => {
    expect(under('BLs above 5L')).toEqual({ proposals: [], reason: NO_MATCH });
    expect(under('trade flows after 01-12-2026')).toEqual({ proposals: [], reason: NO_MATCH });
  });
  it('without a cap or partial fill chosen, nothing outside 1% is offered', () => {
    const r = under('only 4000000024', { fill: ['fewest'], overflow: [] });
    expect(r).toEqual({ proposals: [], reason: NO_MATCH });
  });
});

describe('proposals shown once per amount', () => {
  it('keeps one proposal per assigned amount and BL count', () => {
    const p = (nos: string[], totalUsd: string) => ({ bls: nos, totalUsd, diffPct: 0, tfs: nos.length });
    expect(distinctProposals([p(['a', 'b'], '200000.00'), p(['c', 'd'], '200000.00'), p(['e'], '200000.00')], '200000.00').map(x => x.bls)).toEqual([['a', 'b'], ['e']]);
  });
});

describe('acceptance re-checked against fresh BLs', () => {
  const target = { dealId: '7000000081', usd: '200000.00' };
  const values = { '4000000024': '138600.00', '4000000026': '61400.00', '4000000025': '200000.00' };
  it('accepts a valid plan', () => expect(assignmentProblems(target, { '4000000024': '138600.00', '4000000026': '61400.00' }, ['4000000024', '4000000026'], bls, values)).toEqual([]));
  it('rejects the same BL twice', () => expect(assignmentProblems(target, { '4000000024': '138600.00' }, ['4000000024', '4000000024'], bls, values)[0]).toMatch(/more than once/));
  it('rejects a BL taken meanwhile and a deleted one', () => {
    expect(assignmentProblems(target, { '4000000028': '100000.00' }, ['4000000028'], bls, values)).toEqual(['BL 4000000028 was assigned to Deal ID 7000000050 meanwhile.']);
    expect(assignmentProblems(target, { '4000000029': '100000.00' }, ['4000000029'], bls, values)).toEqual(['BL 4000000029 was deleted.']);
  });
  it('rejects more than the BL value and more than what is left of the deal', () => {
    expect(assignmentProblems(target, { '4000000026': '70000.00' }, ['4000000026'], bls, values)[0]).toMatch(/more than its value/);
    expect(assignmentProblems(target, { '4000000024': '138600.00', '4000000025': '200000.00' }, ['4000000024', '4000000025'], bls, values)[0]).toMatch(/more than what is left/);
  });
  it('accepting the same proposal twice assigns it once (sample data)', async () => {
    const data = sampleProposeData();
    const all = await data.bls();
    const free = all.filter(b => !b.dealId && b.deletedFlag !== 'X' && Number(b.usdValue) > 0)[0];
    const no = String(free.blNo);
    const plan = { [no]: String(free.usdValue) };
    const t = { dealId: 'DL26000142', usd: '283800.00' };
    await data.assign(t, plan, plan);
    await expect(data.assign(t, plan, plan)).rejects.toThrow(/already assigned to this deal/);
    expect((await data.bls()).filter(b => b.blNo === no && b.dealId === 'DL26000142')).toHaveLength(1);
  });
});
