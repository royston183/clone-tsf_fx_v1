// tests/unit/items.test.ts
import { describe, expect, it } from 'vitest';
import { changeSummary, checkItems, checkSelection, itemKeys, itemsList, maxRowsOf, planItems, seenOf, selectionFilters, staleSeen } from '@/lib/items/items';
import type { AnyItemsDef } from '@/modules/types';

const def: AnyItemsDef = {
  kind: 'items', id: 'm', title: 'Monthly', noun: ['amount', 'amounts'], serviceKey: 's', storageKey: 'k', lookups: () => ({}),
  entity: 'amounts', keys: ['company', 'month', 'year', 'gl'],
  selection: [{ field: 'company', label: 'Company Code *', type: 'code', max: 4, required: true }, { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }],
  grid: [
    { field: 'gl', label: 'GL Account *', type: 'code', max: 10, key: true, required: true },
    { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', required: true },
    { field: 'currency', label: 'Currency *', type: 'code', max: 3, required: true }
  ],
  totals: ['amount'],
  check: rows => (rows.filter(r => r.gl.startsWith('6')).length > 1 ? [{ message: 'Only one depreciation account per period.' }] : []),
  maxRows: 3
};
const sel = { company: '1000', month: '04', year: '2026' };

describe('selection', () => {
  it('cleans and checks the selection', () => {
    expect(checkSelection(def, { company: '1000 ', month: '04', year: '2026', extra: 'x' }, {})).toEqual({ selection: sel, problems: {} });
    expect(checkSelection(def, { company: '', month: '13', year: '' }, {}).problems).toEqual({ company: 'Company Code is required', month: "Period '13' is not a valid option.", year: 'Period Year is required' });
  });
  it('builds eq filters and a list over the entity', () => {
    expect(selectionFilters(def, sel)).toEqual([
      { field: 'company', op: 'eq', values: ['1000'] }, { field: 'month', op: 'eq', values: ['04'] }, { field: 'year', op: 'eq', values: ['2026'] }
    ]);
    expect(itemsList(def)).toMatchObject({ entity: 'amounts', keys: ['company', 'month', 'year', 'gl'], defaultSort: { field: 'gl', dir: 1 }, pageSizes: [4] });
    expect(itemKeys(def)).toEqual(['gl']);
    expect(maxRowsOf(def)).toBe(3);
  });
});

describe('checkItems', () => {
  it('checks every row, duplicate item keys and the cross-row rules', () => {
    const rows = [
      { gl: '400100', amount: '1.00', currency: 'INR' }, { gl: '400100', amount: '', currency: 'INR' },
      { gl: '600100', amount: '1.00', currency: 'INR' }, { gl: '600200', amount: '2.00', currency: 'INR' }
    ];
    expect(checkItems(def, rows, sel, {})).toEqual([
      { row: 2, field: 'amount', message: 'Amount is required' },
      { row: 2, field: 'gl', message: "GL Account '400100' is used twice." },
      { message: 'Only one depreciation account per period.' }
    ]);
  });
});

describe('planItems', () => {
  it('plans creates, updates and deletes by the full key and skips unchanged rows', () => {
    const stored = [
      { ...sel, gl: '400100', amount: '100.00', currency: 'INR', __etag: 'W/"1"' },
      { ...sel, gl: '400200', amount: '200.00', currency: 'INR', __etag: 'W/"2"' },
      { ...sel, gl: '500100', amount: '300.00', currency: 'INR', __etag: 'W/"3"' }
    ];
    const plan = planItems(def, stored, [{ gl: '400100', amount: '150.00', currency: 'INR' }, { gl: '400200', amount: '200.00', currency: 'INR' }, { gl: '500200', amount: '5.00', currency: 'USD' }], sel);
    expect(plan.ops).toEqual([
      { op: 'update', id: '1000 / 04 / 2026 / 400100', key: { ...sel, gl: '400100' }, data: { amount: '150.00' }, etag: 'W/"1"' },
      { op: 'create', id: '1000 / 04 / 2026 / 500200', key: { ...sel, gl: '500200' }, data: { ...sel, gl: '500200', amount: '5.00', currency: 'USD' } },
      { op: 'delete', id: '1000 / 04 / 2026 / 500100', key: { ...sel, gl: '500100' }, etag: 'W/"3"' }
    ]);
    expect(plan.result).toEqual({ created: 1, updated: 1, deleted: 1, skipped: 1 });
    expect(changeSummary(plan.result)).toBe('1 changed, 1 new, 1 deleted');
    expect(changeSummary({ created: 0, updated: 0, deleted: 0, skipped: 2 })).toBe('Nothing has changed');
  });
});

describe('what the browser saw (seenOf, staleSeen)', () => {
  const stored = [
    { ...sel, gl: '400100', amount: '100.00', currency: 'INR', __etag: 'W/"1"' },
    { ...sel, gl: '400200', amount: '200.00', currency: 'INR', __etag: 'W/"2"' }
  ];
  it('keeps the key and the ETag of a row; without an ETag its values stand in for it', () => {
    expect(seenOf(def, stored[0])).toEqual({ ...sel, gl: '400100', __etag: 'W/"1"' });
    expect(seenOf(def, { ...sel, gl: '400100', amount: '100.00', currency: 'INR' })).toEqual({ ...sel, gl: '400100', __etag: '', __values: JSON.stringify({ gl: '400100', amount: '100.00', currency: 'INR' }) });
  });
  it('is fresh only when every stored row was seen with the same version, and nothing more was seen', () => {
    const seen = stored.map(r => seenOf(def, r));
    expect(staleSeen(def, stored, seen)).toBe(false);
    expect(staleSeen(def, [...stored, { ...sel, gl: '600100', amount: '1.00', currency: 'INR', __etag: 'W/"9"' }], seen)).toBe(true);
    expect(staleSeen(def, [stored[0], { ...stored[1], __etag: 'W/"7"' }], seen)).toBe(true);
    expect(staleSeen(def, [stored[0]], seen)).toBe(true);
    expect(staleSeen(def, stored, [seen[0], seen[0]])).toBe(true);
    const plain = stored.map(r => Object.fromEntries(Object.entries(r).filter(([f]) => f !== '__etag')));
    expect(staleSeen(def, plain, plain.map(r => seenOf(def, r)))).toBe(false);
    expect(staleSeen(def, [plain[0], { ...plain[1], amount: '250.00' }], plain.map(r => seenOf(def, r)))).toBe(true);
  });
});
