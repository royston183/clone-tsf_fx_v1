import { describe, expect, it } from 'vitest';
import { isPushed, markState } from '@/lib/object/history';

describe('object page history', () => {
  it('marks an entry without Next.js fields or an older mark', () => {
    const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: 1 }, other: 'x', objCreate: true };
    expect(markState(next, 'objOpen')).toEqual({ other: 'x', objOpen: true });
    expect(markState(next)).toEqual({ other: 'x' });
    expect(markState(null, 'objCreate')).toEqual({ objCreate: true });
  });
  it('knows the entries this page pushed', () => {
    expect(isPushed({ __NA: true, objOpen: true })).toBe(true);
    expect(isPushed({ objCreate: true })).toBe(true);
    expect(isPushed({ __NA: true })).toBe(false);
    expect(isPushed(null)).toBe(false);
  });
});
