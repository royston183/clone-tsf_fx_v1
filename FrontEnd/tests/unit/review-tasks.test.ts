import { describe, expect, it } from 'vitest';
import { workflowProgress } from '@/ref/features/mo-generate-invoices-deal-id/workflow-progress';
import { allVerified, isVerified, legId, toggled, type Verified } from '@/ref/features/mo-generate-invoices-deal-id/leg-verify';
import { nextStart } from '@/pages/propose-tradeflows/start-line';
import type { InvRow } from '@/ref/features/mo-generate-invoices-deal-id/types';

const OPTIONS = [
  { key: '01', text: '01 - FO: FX Deals Created' }, { key: '02', text: '02 - MO: FX Deals & MC Assignment Confirmed' }, { key: '03', text: '03 - Deal ID marked for Invoicing' },
  { key: '04', text: '04 - BL Assigned to Deal ID for Invoicing' }, { key: '05', text: '05 - Invoice Created in TRM' }, { key: '30', text: '30 - Deal ID Cancelled' },
];

describe('workflow progress (read-only view of the status master)', () => {
  it('marks what is behind, where the deal is and what is ahead, in code order, from the master only', () => {
    const p = workflowProgress([...OPTIONS].reverse(), '04');
    expect(p.map((s) => s.code)).toEqual(['01', '02', '03', '04', '05', '30']);
    expect(p.map((s) => s.state)).toEqual(['completed', 'completed', 'completed', 'current', 'upcoming', 'upcoming']);
    expect(p[3]).toMatchObject({ text: 'BL Assigned to Deal ID for Invoicing' });
  });
  it('shows the first stage as current at the start and everything ahead as upcoming', () => {
    expect(workflowProgress(OPTIONS, '01').map((s) => s.state)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  });
  it('still shows a current status the master does not list', () => {
    const p = workflowProgress(OPTIONS, '09');
    expect(p.find((s) => s.code === '09')).toMatchObject({ state: 'current' });
    expect(p.map((s) => s.code)).toEqual(['01', '02', '03', '04', '05', '09', '30']);
  });
  it('copes with an empty master', () => {
    expect(workflowProgress([], '04')).toEqual([{ code: '04', text: 'Not listed in the status master', state: 'current' }]);
  });
});

const leg = (ttype: string, extra: Partial<InvRow> = {}): InvRow => ({ ttype, invTrmRef: `D-${ttype}`, invType: 'I01', commodity: 'Coffee Arabica', gtComm: 'C132', invDate: '11-11-2026', dueDate: '11-12-2026', qty: 5598532.31, usdPrice: 1.6, rate: 88.7, price: 141.92, amt: 794543721.68, amtUsd: 8957651.88, planned: 20000000, ...extra }) as InvRow;

describe('invoice leg verification (step 2)', () => {
  const legs = [leg('T1'), leg('T2'), leg('T3')];
  it('starts with nothing verified, and the next step waits until every leg is', () => {
    let v: Verified = {};
    expect(allVerified(v, legs)).toBe(false);
    v = toggled(v, legs[0]!, true);
    expect(allVerified(v, legs)).toBe(false);
    v = toggled(v, legs[1]!, true);
    expect(allVerified(v, legs)).toBe(false);
    v = toggled(v, legs[2]!, true);
    expect(allVerified(v, legs)).toBe(true);
  });
  it('unticking any leg waits again', () => {
    let v: Verified = {};
    for (const l of legs) v = toggled(v, l, true);
    v = toggled(v, legs[1]!, false);
    expect(allVerified(v, legs)).toBe(false);
  });
  it('a leg is known by its identity, not by its position', () => {
    let v: Verified = toggled({}, legs[2]!, true);
    const reordered = [legs[2]!, legs[0]!, legs[1]!];
    expect(isVerified(v, reordered[0]!)).toBe(true);
    expect(isVerified(v, reordered[1]!)).toBe(false);
    expect(legId(legs[0]!)).not.toBe(legId(legs[1]!));
    v = {};
    expect(allVerified(v, reordered)).toBe(false);
  });
  it('a leg whose values change is unverified again, the others stay', () => {
    let v: Verified = {};
    for (const l of legs) v = toggled(v, l, true);
    const recalculated = [legs[0]!, leg('T2', { amt: 1 }), legs[2]!];
    expect(isVerified(v, recalculated[0]!)).toBe(true);
    expect(isVerified(v, recalculated[1]!)).toBe(false);
    expect(allVerified(v, recalculated)).toBe(false);
  });
  it('works for any number of legs, and for none', () => {
    const one = [leg('T1')], four = [leg('T1'), leg('T2'), leg('T3'), leg('T4')];
    expect(allVerified(toggled({}, one[0]!, true), one)).toBe(true);
    let v: Verified = {};
    for (const l of four.slice(0, 3)) v = toggled(v, l, true);
    expect(allVerified(v, four)).toBe(false);
    v = toggled(v, four[3]!, true);
    expect(allVerified(v, four)).toBe(true);
    expect(allVerified({}, [])).toBe(true);
  });
});

describe('loading screen start (rotates each opening)', () => {
  it('moves one product line on each opening and passes through all before repeating', () => {
    const seen: number[] = [];
    let last: number | null = null;
    for (let i = 0; i < 10; i++) { last = nextStart(last, 5); seen.push(last); }
    expect(seen).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
    expect(new Set(seen.slice(0, 5)).size).toBe(5);
  });
  it('is safe for nothing stored, a bad value, a single line and an empty list', () => {
    expect(nextStart(null, 5)).toBe(0);
    expect(nextStart(-3, 5)).toBe(0);
    expect(nextStart(2.5, 5)).toBe(0);
    expect(nextStart(0, 1)).toBe(0);
    expect(nextStart(3, 0)).toBe(0);
    expect(nextStart(9, 5)).toBe(0);
  });
});

import { formatAmount4 } from '@/lib/fields/parse';
describe('four-decimal display', () => {
  it('shows exactly four decimals with thousands separators', () => {
    expect(formatAmount4('1345.0004')).toBe('1,345.0004');
    expect(formatAmount4('10000000')).toBe('10,000,000.0000');
    expect(formatAmount4(8957651.71)).toBe('8,957,651.7100');
    expect(formatAmount4('-2.64')).toBe('-2.6400');
    expect(formatAmount4('0')).toBe('0.0000');
  });
  it('leaves text that is not a number as it is', () => {
    expect(formatAmount4('No price')).toBe('No price');
    expect(formatAmount4('')).toBe('');
  });
});
