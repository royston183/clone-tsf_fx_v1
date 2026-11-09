import { describe, expect, it } from 'vitest';
import { middlewareBlRow, mwBlKey } from '@/pages/propose-tradeflows/mwbl';

const bl = { blNo: '4000000672', tfNo: '3000000673', tfDate: '2026-08-09', blRecordDate: '2026-08-10', blDate: '2026-08-09', quantity: '40000', commodity: 'ARABICA', blNumber: 'VAR-ARA-0007' };
const commodity = { commodity: 'ARABICA', description: 'Coffee Arabica', tsfCommodity: 'C132' };

describe('the middleware row of an assigned BL (what T1, T2 and T3 are built from)', () => {
  const row = middlewareBlRow('7000000035', bl, '35827.20', commodity, '2026-11-09');
  it('carries the keys, the deal, the commodity and the dates', () => {
    expect(row).toMatchObject({ ZTF_NO: '3000000673', ZTF_SPLIT: '01', ZBL_NO: '4000000672', ZBL_SPLIT: '01', ZDEAL_ID: '7000000035', ZINV_COMM: 'Coffee Arabica', ZTRM_COM_ID: 'C132', ZINV_DATE: '2026-11-09', ZBL_STAT_ID: '02' });
  });
  it('the total value is the USD it was assigned with, so the invoice adds up to the deal', () => {
    expect(row.ZQUANTITY).toBe('40000.000');
    expect(row.ZTTV).toBe('35827.20');
  });
  it('leaves out what is not known instead of writing blanks', () => {
    const bare = middlewareBlRow('D', { blNo: 'B', tfNo: 'T', quantity: '1' }, '1', undefined, '2026-11-09');
    expect(Object.entries(bare).every(([k, v]) => v !== '' || k === 'ZBL_REUSE')).toBe(true);
    expect(bare.ZTRM_COM_ID).toBeUndefined();
  });
  it('knows a row that is already there', () => {
    expect(mwBlKey(row)).toBe(mwBlKey({ ZTF_NO: '3000000673', ZBL_NO: '4000000672' }));
  });
});
