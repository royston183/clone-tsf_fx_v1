import { describe, expect, it } from 'vitest';
import { applyDelete, applySplit, blStatus, splitSummary } from '@/pages/manage-tradeflows/logic';

const tf = { tfNo: '3000000016', tfDate: '2026-11-05', quantity: '264554.930', price: '2.1500', currency: 'USD', notifyParty: 'Olam', blNumber: 'OOLU2713071710', blDate: '2023-02-10', etd: '2023-10-02', eta: '2023-03-08', contractRef: '1481405219', contractDate: '', invoiceRef: '9230140070', invoiceDate: '2026-02-09', commodity: 'ALMOND', goods: 'ALMOND STD5', unit: 'LBS' };
const bl = { tfNo: tf.tfNo, tfDate: tf.tfDate, blNo: '4000000013', blRecordDate: '2026-11-05', quantity: '264554.930', dealId: '', deletedFlag: '', deletedBy: '', deletedAt: '', assignedUsd: '', blNumber: tf.blNumber };

describe('blStatus', () => {
  it('reads Deleted, Assigned or Active', () => {
    expect(blStatus({ ...bl, deletedFlag: 'X' })).toEqual({ label: 'Deleted', tone: 'red' });
    expect(blStatus({ ...bl, dealId: 'DL1' })).toEqual({ label: 'Assigned', tone: 'amber' });
    expect(blStatus(bl)).toEqual({ label: 'Active', tone: 'green' });
  });
});

describe('splitSummary', () => {
  it('totals the parts, values each at the trade flow price and shows what is left', () => {
    const s = splitSummary(bl, '0.000', ['132277.465', '100000'], tf.price);
    expect(s).toMatchObject({ total: '232277.465', limit: '264554.930', left: '32277.465', problems: [] });
    expect(s.values).toEqual(['284396.55', '215000.00']);
  });
  it('blocks a total above the limit', () => {
    expect(splitSummary(bl, '0', ['200000', '100000'], tf.price).problems).toEqual(['The BLs add up to 300000.000, more than the 264554.930 available.']);
  });
  it('values nothing without a price', () => expect(splitSummary(bl, '0', ['1', '2'], '').values).toEqual(['', '']));
});

describe('applySplit and applyDelete', () => {
  it('flags the source BL and adds new BLs carrying the trade flow shipment fields, without keys', () => {
    const out = applySplit([bl], bl, ['132277.465', '132277.465'], tf);
    expect(out[0]).toMatchObject({ blNo: '4000000013', deletedFlag: 'X' });
    expect(out.slice(1)).toEqual([
      expect.objectContaining({ blNo: '', blRecordDate: '', quantity: '132277.465', dealId: '', deletedFlag: '', blNumber: 'OOLU2713071710', goods: 'ALMOND STD5', unit: 'LBS', commodity: 'ALMOND' }),
      expect.objectContaining({ blNo: '', quantity: '132277.465' })
    ]);
  });
  it('adds BLs from the open quantity without touching the others', () => {
    const out = applySplit([{ ...bl, quantity: '200000' }], null, ['64554.930'], tf);
    expect(out.map(b => [b.blNo, b.quantity, b.deletedFlag])).toEqual([['4000000013', '200000', ''], ['', '64554.930', '']]);
  });
  it('flags a BL as deleted and keeps the row', () => {
    expect(applyDelete([bl], '4000000013')).toEqual([{ ...bl, deletedFlag: 'X' }]);
  });
});
