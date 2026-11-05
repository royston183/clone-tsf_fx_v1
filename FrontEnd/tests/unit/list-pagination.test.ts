// tests/unit/list-pagination.test.ts
import { describe, expect, it } from 'vitest';
import { clampPage, filterOp, filtersOf, lastPage, rangeText } from '@/lib/list/pagination';
import type { AnyList } from '@/lib/list/types';

const list: AnyList = {
  entity: 'deals', keys: ['deal'], columns: [], defaultSort: { field: 'deal', dir: 1 },
  fields: [
    { field: 'name', label: 'Name', type: 'text' }, { field: 'type', label: 'Type', type: 'select', options: [] },
    { field: 'amount', label: 'Amount', type: 'amount' }, { field: 'start', label: 'Start', type: 'date' },
    { field: 'active', label: 'Active', type: 'flag' }, { field: 'cp', label: 'Counterparty', type: 'suggest' }
  ],
  filters: ['name', 'type', 'amount', 'start', 'active', 'cp', 'ghost']
};

describe('pagination text', () => {
  it('reads like ALM with Indian grouping', () => {
    expect(rangeText(1, 100, 48213)).toBe('1–100 of 48,213');
    expect(rangeText(483, 100, 48213)).toBe('48,201–48,213 of 48,213');
    expect(rangeText(1, 50, 0)).toBe('0 records');
    expect(lastPage(100, 48213)).toBe(483);
    expect(lastPage(50, 0)).toBe(1);
  });
});

describe('filter bar values', () => {
  it('uses the same query for typed, expanded and shorthand amounts', () => {
    const typed = filtersOf(list, { amount: ['8000000', ''] });
    expect(typed).toEqual([{ field: 'amount', op: 'between', values: ['8000000.00', ''] }]);
    expect(filtersOf(list, { amount: ['8000000.00', ''] })).toEqual(typed);
    expect(filtersOf(list, { amount: ['8M', ''] })).toEqual(typed);
  });
  it('picks the operator by field type', () => {
    expect(list.fields.map(filterOp)).toEqual(['contains', 'eq', 'between', 'between', 'eq', 'eq']);
  });
  it('drops blank values and open ranges, keeps one open end, and maps No to an empty flag', () => {
    expect(filtersOf(list, { name: ['abc'], type: [''], amount: ['', ''], start: ['2026-04-01', ''], active: ['-'], cp: ['CP001'], ghost: ['x'] })).toEqual([
      { field: 'name', op: 'contains', values: ['abc'] },
      { field: 'start', op: 'between', values: ['2026-04-01', ''] },
      { field: 'active', op: 'eq', values: [''] },
      { field: 'cp', op: 'eq', values: ['CP001'] }
    ]);
  });
});

describe('clampPage', () => {
  it('moves back to the last page when the total shrinks and leaves valid pages alone', () => {
    expect(clampPage(5, 120, 50)).toBe(3);
    expect(clampPage(2, 120, 50)).toBe(2);
    expect(clampPage(4, 0, 50)).toBe(4);
  });
});
