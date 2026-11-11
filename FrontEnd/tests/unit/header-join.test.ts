import { describe, expect, it } from 'vitest';
import { headerJoin, headerProblem, partialHeader } from '@/ref/features/mo-generate-invoices-deal-id/api';
import { confirmBlocker } from '@/ref/features/mo-generate-invoices-deal-id/confirm-guard';
import type { Deal } from '@/ref/features/mo-generate-invoices-deal-id/types';

const deal = { ZDEAL_ID: '7000000008', ZMC_REF: '2000000018', ZTRD_CODE: '', ZDEAL_STAT: '04' };
const mc = { ZMC_REF_NO: '2000000018', ZMOD_ID: 'M042', ZMC_DESC: 'RUBBER' };
const rule = { ZMOD_ID: 'M032' };

describe('the invoice screen header of a deal whose FX model has no rule (historical deals)', () => {
  it('the full join still needs the rule, as the SAP read does', () => {
    expect(headerJoin(deal, [mc], [], [])).toBeUndefined();
    expect(headerJoin(deal, [mc], [{ ZMOD_ID: 'M042' }], [])).toBeDefined();
  });
  it('what the deal and its master contract hold can still be shown, even without a trader', () => {
    const p = partialHeader(deal, [mc], []);
    expect(p?.deal).toBe(deal);
    expect(p?.mc).toBe(mc);
    expect(partialHeader(deal, [], [])).toBeUndefined();
    expect(partialHeader(undefined, [mc], [])).toBeUndefined();
  });
  it('names exactly what is missing', () => {
    expect(headerProblem('7000000008', undefined, [], [])).toContain('not found in ZSGTSFTR_DEALID');
    expect(headerProblem('7000000008', deal, [], [rule])).toContain('master contract 2000000018');
    expect(headerProblem('7000000008', deal, [], [rule])).toContain('ZSGTSFTR_MAS_CON');
    const noRule = headerProblem('7000000008', deal, [mc], [rule]);
    expect(noRule).toContain('FX model M042');
    expect(noRule).toContain('ZSGTSFTR_RULE_BT');
    expect(noRule).toContain('maintained in SAP');
    expect(headerProblem('7000000008', deal, [mc], [{ ZMOD_ID: 'M042' }])).toBe('');
  });
  it('such a deal is blocked with that reason and offers no "create invoice rows"', () => {
    const d = { dealId: '7000000008', status: '04', inv: [], invReason: 'rule of M042 missing' } as unknown as Deal;
    const b = confirmBlocker(d, { loading: false, error: '', count: 113 });
    expect(b).toMatchObject({ blocked: true, message: 'rule of M042 missing' });
  });
});
