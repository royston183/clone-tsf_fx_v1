import { describe, expect, it } from 'vitest';
import { dealsWithBls, statusWithBls } from '@/pages/propose-tradeflows/logic';

describe('Deal ID status follows the assigned BLs', () => {
  it('moves only 03 (marked for invoicing) to 04: no stage is skipped, and 04 or later is never touched', () => {
    expect(statusWithBls('03')).toBe('04');
    expect(['01', '02', '04', '05', '07', '20', '', 'X'].map(statusWithBls)).toEqual([null, null, null, null, null, null, null, null]);
  });
  it('lists the Deal IDs with an active BL only', () => {
    expect(dealsWithBls([{ dealId: 'A' }, { dealId: 'A' }, { dealId: 'B', deletedFlag: 'X' }, { dealId: '' }])).toEqual(['A']);
  });
});

import { assignStatusProblem, BL_ASSIGNABLE, canMove } from '@/pages/propose-tradeflows/status-rules';

describe('Deal ID status guards for BL assignment', () => {
  it('BLs go only to a Deal ID marked for invoicing (03) or already holding BLs (04)', () => {
    expect(BL_ASSIGNABLE).toEqual(['03', '04']);
    expect(assignStatusProblem('D', '03')).toBe('');
    expect(assignStatusProblem('D', '04')).toBe('');
  });
  it('an earlier status is told to be marked for invoicing first', () => {
    for (const s of ['01', '02']) expect(assignStatusProblem('D', s)).toContain('marked for invoicing (status 03)');
  });
  it('a later status is past BL assignment', () => {
    for (const s of ['05', '07', '20', '30']) expect(assignStatusProblem('D', s)).toContain('past BL assignment');
  });
  it('the app makes one status change itself, 03 to 04, and refuses every other jump', () => {
    expect(canMove('03', '04')).toBe(true);
    for (const [from, to] of [['02', '04'], ['01', '04'], ['04', '05'], ['04', '03'], ['03', '05'], ['', '04']]) expect(canMove(from!, to!)).toBe(false);
  });
});
