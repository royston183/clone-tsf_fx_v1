import { describe, expect, it } from 'vitest';
import { dealsWithBls, statusWithBls } from '@/pages/propose-tradeflows/logic';

describe('Deal ID status follows the assigned BLs', () => {
  it('moves 01–03 to 04 and never touches 04 or later', () => {
    expect(['01', '02', '03'].map(statusWithBls)).toEqual(['04', '04', '04']);
    expect(['04', '05', '07', '20', '', 'X'].map(statusWithBls)).toEqual([null, null, null, null, null, null]);
  });
  it('lists the Deal IDs with an active BL only', () => {
    expect(dealsWithBls([{ dealId: 'A' }, { dealId: 'A' }, { dealId: 'B', deletedFlag: 'X' }, { dealId: '' }])).toEqual(['A']);
  });
});
