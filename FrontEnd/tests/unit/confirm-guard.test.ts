import { describe, expect, it } from 'vitest';
import { confirmBlocker } from '@/ref/features/mo-generate-invoices-deal-id/confirm-guard';
import type { Deal, InvRow } from '@/ref/features/mo-generate-invoices-deal-id/types';

const deal = (inv: Partial<InvRow>[]): Deal => ({ dealId: '7000000081', inv } as unknown as Deal);
const ready = { loading: false, error: '', count: 221 };

describe('what stands in the way of confirming an invoice', () => {
  it('waits while the BLs are still being read', () => {
    expect(confirmBlocker(deal([]), { ...ready, loading: true }).code).toBe('loading');
  });
  it('says so when the BLs could not be read', () => {
    const b = confirmBlocker(deal([]), { ...ready, error: 'timeout' });
    expect(b.code).toBe('bls-error');
    expect(b.message).toContain('timeout');
  });
  it('no BLs assigned: points to Propose Tradeflow', () => {
    const b = confirmBlocker(deal([]), { ...ready, count: 0 });
    expect(b.code).toBe('no-bls');
    expect(b.message).toContain('Propose Tradeflow');
  });
  it('BLs assigned in SAP but no invoice rows (the 7000000081 case): names what is missing and the way out', () => {
    const b = confirmBlocker(deal([]), ready);
    expect(b.code).toBe('no-rows');
    expect(b.message).toContain('221 BLs are assigned');
    expect(b.message).toContain('Create invoice rows');
  });
  it('every row already finalised: nothing left', () => {
    expect(confirmBlocker(deal([{ locked: true }, { locked: true }]), ready).code).toBe('nothing-left');
  });
  it('rows ready: nothing in the way', () => {
    expect(confirmBlocker(deal([{ locked: false, invTrmRef: 'D-T1', rec: { ZINV_REF: 'D-T1' } } as unknown as InvRow, { locked: true }]), ready)).toEqual({ code: '', message: '' });
  });
});

describe('invoice rows that would share one key (deals without trade invoice references)', () => {
  const row = (ref: string, extra: Partial<InvRow> = {}) => ({ locked: false, ttype: 'T1', invTrmRef: ref, rec: { ZDEAL_ID: 'D', ZINV_REF: ref, ZINV_TYPE: 'I01', ZPRE_T_REF: '' }, ...extra }) as unknown as InvRow;
  it('blocks rows without a trade invoice reference, before anything is written', () => {
    const b = confirmBlocker(deal([row(''), row(''), row('')]), ready);
    expect(b.code).toBe('no-refs');
    expect(b.message).toContain('ZSGTSFTR_INV_REF');
  });
  it('blocks two rows with the same key', () => {
    expect(confirmBlocker(deal([row('D-T1'), row('D-T1')]), ready).code).toBe('no-refs');
  });
  it('lets rows with their own references through', () => {
    expect(confirmBlocker(deal([row('D-T1'), row('D-T2'), row('D-T3')]), ready).code).toBe('');
  });
});
