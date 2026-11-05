import { describe, expect, it } from 'vitest';
import { changedFields } from '@/components/ui/ReviewDialog';
import { filterItems } from '@/components/ui/ValueHelpDialog';

describe('changedFields', () => {
  it('lists only fields whose canonical value changed', () => {
    const fields = [{ field: 'a', label: 'A', type: 'amount' as const }, { field: 'b', label: 'B' }];
    expect(changedFields(fields, { a: '10.00', b: 'x' }, { a: '10', b: 'x' })).toEqual([]);
    expect(changedFields(fields, { a: '10.00', b: 'x' }, { a: '11', b: 'x' }).map(f => f.field)).toEqual(['a']);
  });
});

describe('filterItems (value help search)', () => {
  const items = [{ CODE: 'INR', TEXT: 'Indian Rupee' }, { CODE: 'USD', TEXT: 'US Dollar' }];
  it('matches code or text, case-insensitive', () => {
    expect(filterItems(items, 'rup').map(i => i.CODE)).toEqual(['INR']);
    expect(filterItems(items, 'usd').map(i => i.CODE)).toEqual(['USD']);
    expect(filterItems(items, '')).toHaveLength(2);
  });
});

import { modalStack } from '@/components/ui/Modal';

describe('modalStack', () => {
  it('only the innermost open modal is on top', () => {
    const a = {}, b = {};
    modalStack.push(a); modalStack.push(b);
    expect(modalStack.isTop(a)).toBe(false);
    expect(modalStack.isTop(b)).toBe(true);
    modalStack.remove(b);
    expect(modalStack.isTop(a)).toBe(true);
    modalStack.remove(a);
  });
  it('size reports how many modals are open', () => {
    const a = {}, b = {};
    const base = modalStack.size();
    modalStack.push(a); modalStack.push(b);
    expect(modalStack.size()).toBe(base + 2);
    modalStack.remove(b); modalStack.remove(a);
    expect(modalStack.size()).toBe(base);
  });
});
