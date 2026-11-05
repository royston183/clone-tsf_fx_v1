import { describe, expect, it } from 'vitest';
import { equalSplit, openQuantity, splitProblems } from '@/modules/tradeflow-manage/split';
import { tradeflowManage } from '@/modules/tradeflow-manage/definition';
import { tradeflowManageSeed } from '@/modules/tradeflow-manage/seed';
import { MODULES } from '@/modules/registry';

describe('split arithmetic', () => {
  it('divides a quantity equally to 3 decimals, the remainder going to the first BLs', () => {
    expect(equalSplit('100.000', 3)).toEqual(['33.334', '33.333', '33.333']);
    expect(equalSplit('264554.930', 2)).toEqual(['132277.465', '132277.465']);
    expect(equalSplit('0.002', 3)).toEqual(['0.001', '0.001', '0.000']);
  });
  it('gives the trade flow quantity not held by active BLs', () => {
    expect(openQuantity('100', [{ quantity: '60' }, { quantity: '30', deletedFlag: 'X' }])).toBe('40.000');
    expect(openQuantity('100', [{ quantity: '100' }])).toBe('0.000');
  });
  it('refuses a source with a Deal ID, a total above the limit, and empty quantities', () => {
    expect(splitProblems({ blNo: '4000000012', dealId: 'DL1' }, '0', ['50', '50'])).toEqual(['BL 4000000012 has Deal ID DL1: unassign it in Propose Tradeflows first.']);
    expect(splitProblems({ blNo: '4000000012', dealId: '', quantity: '100' }, '0', ['60', '50'])).toEqual(['The BLs add up to 110.000, more than the 100.000 available.']);
    expect(splitProblems(null, '40', ['30', '20'])).toEqual(['The BLs add up to 50.000, more than the 40.000 available.']);
    expect(splitProblems(null, '40', ['30', '0'])).toEqual(['Each BL needs a quantity greater than zero.']);
    expect(splitProblems({ blNo: '1', dealId: '', quantity: '100' }, '0', ['33.334', '33.333', '33.333'])).toEqual([]);
  });
});

describe('tradeflow-manage module', () => {
  const seed = tradeflowManageSeed();
  const lk = tradeflowManage.lookups(undefined);
  const header = seed.tables.tradeflows[0];
  const bls = seed.tables.bl.filter(b => b.tfNo === header.tfNo);
  it('is registered, opens on a page, edits only BLs (SAP numbers new ones)', () => {
    expect(MODULES['tradeflow-manage']).toBe(tradeflowManage);
    expect(tradeflowManage.opens).toEqual({ create: 'page', open: 'page' });
    expect([tradeflowManage.canCreate, tradeflowManage.canDelete]).toEqual([false, false]);
    const tab = tradeflowManage.tabs.find(t => t.id === 'bl');
    expect(tab).toMatchObject({ kind: 'items', keyBySap: true, keys: ['blNo', 'blRecordDate'] });
    expect(tradeflowManage.lockedFields?.(header)).toEqual(expect.arrayContaining(['tfNo', 'quantity', 'commodity']));
  });
  it('refuses BLs that add up to more than the trade flow', () => {
    const over = [...bls, { tfNo: header.tfNo, tfDate: header.tfDate, blNo: '', blRecordDate: '', quantity: '1', deletedFlag: '' }];
    const p = tradeflowManage.check?.(header, { bl: over }, lk, 'edit');
    expect(p?.messages.join(' ')).toMatch(/add up to .* more than the trade flow/);
  });
  it('accepts a split that stays within the trade flow', () => {
    const q = header.quantity;
    const split: Record<string, string>[] = [{ ...bls[0], deletedFlag: 'X' }, { blNo: '', blRecordDate: '', quantity: q, deletedFlag: '' }];
    expect(tradeflowManage.check?.(header, { bl: split }, lk, 'edit')).toEqual({ header: {}, items: {}, messages: [] });
  });
});
