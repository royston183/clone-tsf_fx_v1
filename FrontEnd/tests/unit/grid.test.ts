import { describe, expect, it } from 'vitest';
import { code, col, editValues, columnValues, rowsToSave, fmtDate, fmtStamp, freshUi, keyOf, parseClipboard, pasteInto, pasteValue, str, text, validateGrid, visibleRows } from '@/lib/grid/grid';
import { ariaSort, compareValues, nextSort, sortRows } from '@/lib/grid/sort';
import type { GridRow, Option, Row, TabDef, UiState } from '@/lib/grid/types';

type L = { kinds: Option[] };
const lk: L = { kinds: [{ value: '01', label: 'Day(s)' }, { value: '02', label: 'Month(s)' }] };
const tab: TabDef<L> = {
  id: 't', label: 'Things', title: 'Things', noun: ['Thing', 'Things'], editable: true, keys: ['id'], defaultSort: { col: 'id', dir: 1 },
  columns: [col('id', 'ID', { code: true }), col('name', 'Name'), col('kind', 'Kind'), col('qty', 'Qty', { sort: r => Number(r.qty) || 0 })],
  search: r => [r.id, r.name],
  filters: [{ id: 'kind', all: 'All Kinds', options: (_rows, l) => l.kinds, match: (r, v) => r.kind === v }],
  grid: [
    { field: 'id', label: 'ID *', clean: v => code(v, 4), key: true, mono: true },
    { field: 'name', label: 'Name *', clean: v => text(v, 20) },
    { field: 'kind', label: 'Kind', options: l => l.kinds },
    { field: 'active', label: 'Active', flag: true },
    { field: 'qty', label: 'Qty', clean: v => text(v, 5) }
  ],
  check: r => ({ name: r.name ? '' : 'required', qty: r.qty && !/^\d+$/.test(r.qty) ? 'Qty must be a whole number.' : '' })
};
const rows: Row[] = [
  { id: 'A10', name: 'Gamma', kind: '02', qty: '10', active: 'X' },
  { id: 'A2', name: 'alpha', kind: '01', qty: '2', active: '' },
  { id: 'B1', name: '', kind: '01', qty: '', active: '' }
];
const ui = (over: Partial<UiState> = {}): UiState => ({ ...freshUi(tab), ...over });
let id = 1;
const g = (values: GridRow['values'] = {}, orig?: Row): GridRow => ({ id: id++, values, orig });

describe('text helpers', () => {
  it('trims, cleans and formats', () => {
    expect(str(null)).toBe('');
    expect(str('  a ')).toBe('a');
    expect(code(' ab-12x ', 4)).toBe('AB12');
    expect(text('a   b  c', 3)).toBe('a b');
    expect(fmtDate('20260915')).toBe('15-09-2026');
    expect(fmtDate('00000000')).toBe('');
    expect(fmtDate('2026-09-15T00:00:00Z')).toBe('15-09-2026');
    expect(fmtStamp('SAMPLE', '20260915', '090100')).toBe('SAMPLE on 15-09-2026 at 09:01:00');
    expect(fmtStamp('', '20260915', '090100')).toBe('');
    expect(keyOf(tab, rows[0])).toBe('A10');
  });
});

describe('sorting', () => {
  it('compares naturally and numerically', () => {
    expect(compareValues('A2', 'A10')).toBeLessThan(0);
    expect(compareValues(10, 9)).toBeGreaterThan(0);
    expect(compareValues('a', 'B')).toBeLessThan(0);
  });
  it('keeps blanks last in both directions', () => {
    const names = (s: 1 | -1) => sortRows(rows, (r, c) => r[c], { col: 'name', dir: s }).map(r => r.name);
    expect(names(1)).toEqual(['alpha', 'Gamma', '']);
    expect(names(-1)).toEqual(['Gamma', 'alpha', '']);
  });
  it('toggles direction and reports aria-sort', () => {
    const s1 = nextSort({ col: null, dir: 1 }, 'name');
    expect(s1).toEqual({ col: 'name', dir: 1 });
    expect(nextSort(s1, 'name')).toEqual({ col: 'name', dir: -1 });
    expect(ariaSort(s1, 'name')).toBe('ascending');
    expect(ariaSort(s1, 'qty')).toBe('none');
  });
});

describe('visibleRows', () => {
  it('applies search, filter, column filter and sort', () => {
    expect(visibleRows(tab, rows, ui({ search: 'ALP' })).map(r => r.id)).toEqual(['A2']);
    expect(visibleRows(tab, rows, ui({ filters: { kind: '02' } })).map(r => r.id)).toEqual(['A10']);
    expect(visibleRows(tab, rows, ui({ columnFilters: { name: [''] } })).map(r => r.id)).toEqual(['B1']);
    expect(visibleRows(tab, rows, ui({ sort: { col: 'qty', dir: -1 } })).map(r => r.id)).toEqual(['A10', 'A2', 'B1']);
    expect(visibleRows(tab, rows, ui()).map(r => r.id)).toEqual(['A2', 'A10', 'B1']);
  });
  it('lists a column’s values ignoring that column’s own filter', () => {
    const name = tab.columns[1];
    expect(columnValues(tab, rows, ui({ columnFilters: { name: ['alpha'] } }), name)).toEqual(['', 'alpha', 'Gamma']);
  });
});

describe('pasting from Excel', () => {
  it('ignores a single value and splits CRLF blocks', () => {
    expect(parseClipboard('abc')).toBeNull();
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
  it('keeps blank cells in a pasted column so later values stay on their rows', () => {
    expect(parseClipboard('a\r\n\r\nc\r\n')).toEqual([['a'], [''], ['c']]);
    const opened = [g({ id: 'A10', name: 'x' }, rows[0]), g({ id: 'A2', name: 'y' }, rows[1]), g({ id: 'B1', name: 'z' }, rows[2])];
    const out = pasteInto(tab, 'edit', opened, 0, 'name', 'one\r\n\r\nthree\r\n', lk, () => g());
    expect(out?.map(r => r.values.name)).toEqual(['one', '', 'three']);
  });
  it('maps option text, first letters and flags', () => {
    const kind = tab.grid[2], active = tab.grid[3];
    expect(pasteValue(kind, 'Month(s)', lk)).toBe('02');
    expect(pasteValue(kind, '01', lk)).toBe('01');
    expect(pasteValue(kind, 'monthly', lk)).toBe('02');
    expect(pasteValue(kind, '', lk)).toBe('');
    expect(pasteValue(active, 'yes', lk)).toBe(true);
    expect(pasteValue(active, 'no', lk)).toBe(false);
  });
  it('pasteInto appends rows in add mode and ignores extra columns', () => {
    const start = [g()];
    const out = pasteInto(tab, 'add', start, 0, 'name', 'N1\tDay(s)\tyes\t5\textra\textra2\r\nN2\tMonth(s)\tno\t7\r\n', lk, () => g());
    expect(out).toHaveLength(2);
    expect(out![0].values).toEqual({ name: 'N1', kind: '01', active: true, qty: '5' });
    expect(out![1].values).toEqual({ name: 'N2', kind: '02', active: false, qty: '7' });
  });
  it('pasteInto never appends or writes keys in edit mode', () => {
    const start = [g({ id: 'A2', name: 'alpha' }, rows[1])];
    const out = pasteInto(tab, 'edit', start, 0, 'id', 'ZZ\tNew\r\nYY\tOther', lk, () => g());
    expect(out).toHaveLength(1);
    expect(out![0].values).toEqual({ id: 'A2', name: 'New' });
    expect(pasteInto(tab, 'edit', start, 0, 'name', 'just text', lk, () => g())).toBeNull();
  });
});

describe('validateGrid', () => {
  it('flags required, exists, duplicate, missing key and blank rows', () => {
    const checked = validateGrid(tab, [g({ id: 'a2', name: 'x' }), g({ id: 'N1', name: '' }), g({ id: 'N2', name: 'y' }), g({ id: 'N2', name: 'z' }), g({}), g({ name: 'no key' })], rows, 'add', lk);
    expect(checked[0].bad.id).toBe('exists');
    expect(checked[1].bad.name).toBe('required');
    expect(checked[2].valid).toBe(true);
    expect(checked[3].bad.id).toBe('duplicate');
    expect(checked[4]).toMatchObject({ blank: true, valid: false });
    expect(checked[5].bad.id).toBe('required');
  });
  it('reports changes in edit mode', () => {
    const same = g({ id: 'A2', name: 'alpha', kind: '01', active: false, qty: '2' }, rows[1]);
    const changed = g({ id: 'A2', name: 'beta', kind: '01', active: false, qty: '2' }, rows[1]);
    const gone = g({ id: 'ZZ', name: 'x' }, { id: 'ZZ', name: 'x' });
    // Same key twice in one grid is a duplicate, so the changed copy is validated on its own.
    const [a, c] = validateGrid(tab, [same, gone], rows, 'edit', lk);
    const [b] = validateGrid(tab, [changed], rows, 'edit', lk);
    expect(a).toMatchObject({ valid: true, changed: false });
    expect(b).toMatchObject({ valid: true, changed: true });
    expect(c.bad.id).toBe('missing');
  });
});

describe('rowsToSave', () => {
  it('sends each edited row with the ETag it was opened with', () => {
    const opened = g({ id: 'A2', name: 'beta' }, { ...rows[1], __etag: 'W/"7"' });
    const fresh = g({ id: 'N1', name: 'new' });
    const checked = validateGrid(tab, [opened, fresh], rows, 'add', lk);
    expect(rowsToSave(checked, [opened, fresh])).toEqual([{ ...checked[0].row, __etag: 'W/"7"' }, checked[1].row]);
  });
});

describe('typed columns', () => {
  type T = Record<string, never>;
  const typed: TabDef<T> = {
    id: 'd', label: 'Deals', title: 'Deals', noun: ['Deal', 'Deals'], editable: true, keys: ['id'], defaultSort: { col: 'id', dir: 1 },
    columns: [col('id', 'ID')], search: r => [r.id], filters: [],
    grid: [
      { field: 'id', label: 'ID *', type: 'code', max: 4, key: true },
      { field: 'from', label: 'Validity', type: 'dateRange', toField: 'to' },
      { field: 'amount', label: 'Amount', type: 'amount' },
      { field: 'note', label: 'Note', computed: () => 'auto' }
    ],
    check: () => ({})
  };
  it('pastes a date range and an amount into their own fields, skipping computed columns', () => {
    const out = pasteInto(typed, 'add', [g()], 0, 'id', 'd1\t01-04-2026\t31.03.2027\t1,23,456.5\tignored\r\n', {}, () => g());
    expect(out![0].values).toEqual({ id: 'D1', from: '2026-04-01', to: '2027-03-31', amount: '123456.50' });
  });
  it('validates and saves the expanded fields', () => {
    const [v] = validateGrid(typed, [g({ id: 'D1', from: '01-04-2026', to: '31-03-2027', amount: '10' })], [], 'add', {});
    expect(v.row).toEqual({ id: 'D1', from: '2026-04-01', to: '2027-03-31', amount: '10.00' });
  });
  it('does not mark SAP rows with leading-zero integers as changed', () => {
    const numc: TabDef<T> = { ...typed, grid: [{ field: 'id', label: 'ID', key: true }, { field: 'n', label: 'N', type: 'integer' }] };
    const [v] = validateGrid(numc, [g({ id: 'A', n: '00005' }, { id: 'A', n: '00005' })], [{ id: 'A', n: '00005' }], 'edit', {});
    expect(v).toMatchObject({ valid: true, changed: false });
  });
});

describe('type checks run before module checks', () => {
  type T = Record<string, never>;
  const mk = (check: TabDef<T>['check']): TabDef<T> => ({
    id: 'd', label: 'Deals', title: 'Deals', noun: ['Deal', 'Deals'], editable: true, keys: ['id'], defaultSort: { col: 'id', dir: 1 },
    columns: [col('id', 'ID')], search: r => [r.id], filters: [],
    grid: [{ field: 'id', label: 'ID', key: true }, { field: 'n', label: 'N *', type: 'integer', max: 5 }], check
  });
  it('reports the type problem even when the module check returns an empty message', () => {
    const [v] = validateGrid(mk(() => ({ n: '' })), [g({ id: 'A', n: '123456' })], [], 'add', {});
    expect(v.bad.n).toBe('N allows at most 5 digits.');
    expect(v.valid).toBe(false);
  });
  it('lets a module message replace the type message of the same field', () => {
    const [v] = validateGrid(mk(() => ({ n: 'Mine' })), [g({ id: 'A', n: '123456' })], [], 'add', {});
    expect(v.bad.n).toBe('Mine');
  });
});

describe('edit grid start values', () => {
  const t: TabDef<L> = {
    ...tab, keys: ['id'],
    grid: [
      { field: 'id', label: 'ID *', type: 'code', key: true },
      { field: 'valid', label: 'Validity', type: 'dateRange', toField: 'validTo' },
      { field: 'month', label: 'Period', type: 'period', yearField: 'year' },
      { field: 'active', label: 'Active', flag: true }
    ],
    check: () => ({})
  };
  const row: Row = { id: 'A1', valid: '2026-04-01', validTo: '2026-09-30', month: '04', year: '2026', active: 'X' };
  it('carries the range end, the period year and flags as booleans', () => {
    expect(editValues(t, row)).toEqual({ id: 'A1', valid: '2026-04-01', validTo: '2026-09-30', month: '04', year: '2026', active: true });
  });
  it('an untouched row is not changed', () => {
    const [c] = validateGrid(t, [g(editValues(t, row), row)], [row], 'edit', lk);
    expect(c.changed).toBe(false);
    expect(c.row.validTo).toBe('2026-09-30');
    expect(c.row.year).toBe('2026');
  });
  it('pasting one MM-YYYY cell fills month and year', () => {
    const rows2 = pasteInto(t, 'add', [g()], 0, 'month', '04-2026\n2026-05', lk, () => g());
    expect(rows2?.[0].values).toMatchObject({ month: '04', year: '2026' });
    expect(rows2?.[1].values).toMatchObject({ month: '05', year: '2026' });
  });
});

describe('pasteInto with periods', () => {
  it('pastes into the year cell of a period and continues with the next column', () => {
    const t = { grid: [{ field: 'month', label: 'Period', type: 'period' as const, yearField: 'year' }, { field: 'amount', label: 'Amount', type: 'amount' as const }] };
    const out = pasteInto(t, 'add', [{ id: 1, values: {} }], 0, 'year', '2027\t1,500\r\n', {}, () => ({ id: 2, values: {} }));
    expect(out?.[0].values).toEqual({ year: '2027', amount: '1500.00' });
  });
});
