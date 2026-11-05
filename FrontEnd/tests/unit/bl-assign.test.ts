import { describe, expect, it } from 'vitest';
import { blAssign, BL_ASSIGN_FIELDS, BL_ASSIGN_WRITABLE } from '@/modules/bl-assign/definition';
import { blAssignSeed } from '@/modules/bl-assign/seed';
import { MODULES } from '@/modules/registry';

describe('bl-assign module', () => {
  it('is registered, internal, and keyed by BL No and record date', () => {
    expect(MODULES['bl-assign']).toBe(blAssign);
    expect(blAssign.internal).toBe(true);
    expect(blAssign.tabs[0].keys).toEqual(['blNo', 'blRecordDate']);
  });
  it('changes only the Deal ID and the USD it was matched with', () => expect(BL_ASSIGN_WRITABLE).toEqual(['dealId', 'assignedUsd']));
  it('reads no BL value or currency (Propose works them out from the trade flow price)', () => {
    expect(BL_ASSIGN_FIELDS).not.toContain('blValue');
    expect(blAssignSeed().tables.bls[0]).toMatchObject({ blNo: '4000000001', dealId: '' });
  });
});
