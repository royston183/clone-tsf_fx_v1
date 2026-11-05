// tests/unit/edit-rows.test.ts
import { describe, expect, it } from 'vitest';
import { changedFromDefaults, gridRowsOf, keepKeys, problemsByGrid, rowsOfGrid } from '@/lib/grid/edit-rows';
import type { GridRow, Row } from '@/lib/grid/types';

const fields = [
  { field: 'seq', label: 'No.', type: 'integer' as const, key: true },
  { field: 'amount', label: 'Amount', type: 'amount' as const },
  { field: 'paid', label: 'Paid', type: 'flag' as const }
];
let id = 0;
const make = (values: GridRow['values'], orig?: Row): GridRow => ({ id: ++id, values, orig });

describe('edit rows', () => {
  it('turns stored rows into grid rows and back, leaving out new blank rows', () => {
    const grid = gridRowsOf(fields, [{ seq: '1', amount: '10.00', paid: 'X', __etag: 'e' }], make);
    expect(grid[0].values).toEqual({ seq: '1', amount: '10.00', paid: true });
    expect(grid[0].orig?.__etag).toBe('e');
    const out = rowsOfGrid(fields, [...grid, make({ seq: '2', amount: '', paid: false }), make({ seq: '3', amount: '5', paid: false })]);
    expect(out.rows).toEqual([{ seq: '1', amount: '10.00', paid: 'X' }, { seq: '3', amount: '5.00', paid: '' }]);
    expect(out.index).toEqual([0, 2]);
  });
  it('keeps a stored row that was emptied (it must fail its checks, not vanish)', () => {
    expect(rowsOfGrid(fields, [make({ seq: '1', amount: '', paid: false }, { seq: '1', amount: '10.00', paid: '' })]).rows).toEqual([{ seq: '1', amount: '', paid: '' }]);
  });
  it('never re-keys a stored row on paste', () => {
    const out = keepKeys(fields, [make({ seq: '9', amount: '1', paid: false }, { seq: '1' }), make({ seq: '5', amount: '', paid: false })]);
    expect(out.map(r => r.values.seq)).toEqual(['1', '5']);
  });
  it('maps problems of cleaned rows back to grid rows; a row problem without a field stays on its row', () => {
    expect(problemsByGrid([{ row: 2, field: 'amount', message: 'Amount is required' }, { row: 1, message: 'Row is locked' }, { row: 2, field: '', message: 'Row is unbalanced' }, { row: 9, field: 'x', message: 'no row' }], [0, 2]))
      .toEqual({ 0: { '': 'Row is locked' }, 2: { amount: 'Amount is required', '': 'Row is unbalanced' } });
  });
  it('compares a new object with its defaults as cleaned values', () => {
    const defaults = { seq: '', amount: '', paid: '' };
    expect(changedFromDefaults(fields, defaults, { seq: '', amount: '', paid: '' }, {})).toBe(false);
    expect(changedFromDefaults(fields, defaults, { seq: '', amount: '  ', paid: '' }, { items: [] })).toBe(false);
    expect(changedFromDefaults(fields, defaults, { seq: '', amount: '5', paid: '' }, {})).toBe(true);
    expect(changedFromDefaults(fields, defaults, { seq: '', amount: '', paid: '' }, { items: [{ seq: '1' }] })).toBe(true);
  });
});
