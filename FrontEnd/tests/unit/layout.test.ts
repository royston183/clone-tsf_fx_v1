// tests/unit/layout.test.ts
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import { alvModel, checkLayoutInput, defaultLayout, listLayoutTarget, normalizeLayout, reportLayoutTarget, sortLayoutRows, subtotalLabel, toggleKey, type GridLine, type SubtotalLine } from '@/lib/layout/layout';
import type { LayoutState, ReportColumn, SavedLayout } from '@/lib/report/types';
import { deals } from '@/modules/samples/deals/definition';

const columns: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' },
  { id: 'counterparty', label: 'Counterparty', type: 'code', textField: 'cpName' },
  { id: 'payDate', label: 'Payment Date', type: 'date' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' },
  { id: 'currency', label: 'Currency', type: 'code' }
];
const standard: LayoutState = { columns: ['company', 'counterparty', 'amount', 'currency'], sort: [], subtotals: ['company'], unit: null, subtotalsOnly: false };
const target = reportLayoutTarget(columns, standard, {}, ['ABSOLUTE', 'LAKHS']);
const rows: Row[] = [
  { company: '2000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-05', amount: '100.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-03', amount: '0.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-02', amount: '0.20', currency: 'INR' },
  { company: '1000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-04', amount: '50.00', currency: 'USD' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-01', amount: '25.00', currency: 'USD' }
];
const grouped: LayoutState = { columns: ['company', 'counterparty', 'amount', 'currency'], sort: [{ col: 'payDate', desc: false }], subtotals: ['company', 'counterparty'], unit: null, subtotalsOnly: false };
const subtotals = (grid: GridLine[]) => grid.filter((l): l is SubtotalLine => l.type === 'subtotal');
const input = (layout: Record<string, unknown>, meta: Record<string, unknown> = {}) => ({ name: 'By company', description: '', scope: 'shared', isDefault: false, layout: { ...standard, ...layout }, ...meta });

describe('normalizeLayout', () => {
  it('drops unknown and duplicate columns, unsortable sorts, non-text subtotals and unknown units', () => {
    expect(normalizeLayout({ columns: ['amount', 'gone', 'amount', 'company'], sort: [{ col: 'gone' }, { col: 'amount', desc: true }, { col: 'amount' }], subtotals: ['amount', 'company', 'gone'], unit: 'MILES', subtotalsOnly: true }, target))
      .toEqual({ columns: ['amount', 'company'], sort: [{ col: 'amount', desc: true }], subtotals: ['company'], unit: null, subtotalsOnly: true });
    expect(normalizeLayout({ ...standard, unit: 'LAKHS' }, target).unit).toBe('LAKHS');
  });
  it('keeps a saved layout usable after a column was removed', () => {
    const fewer = reportLayoutTarget(columns.filter(c => c.id !== 'counterparty'), standard);
    expect(normalizeLayout({ columns: ['counterparty', 'amount'], sort: [{ col: 'counterparty', desc: false }], subtotals: ['counterparty'], unit: null, subtotalsOnly: true }, fewer))
      .toEqual({ columns: ['amount'], sort: [], subtotals: [], unit: null, subtotalsOnly: false });
    expect(normalizeLayout({ columns: ['counterparty'] }, fewer).columns).toEqual(['company', 'amount', 'currency']);
  });
  it('falls back to the standard columns for anything else and caps sorts and subtotals', () => {
    expect(normalizeLayout(null, target)).toEqual({ columns: standard.columns, sort: [], subtotals: [], unit: null, subtotalsOnly: false });
    const small = reportLayoutTarget(columns, standard, { maxSort: 2, maxSubtotals: 1 });
    const out = normalizeLayout({ columns: ['company'], sort: [{ col: 'company' }, { col: 'payDate' }, { col: 'amount' }], subtotals: ['company', 'counterparty'] }, small);
    expect(out.sort.map(s => s.col)).toEqual(['company', 'payDate']);
    expect(out.subtotals).toEqual(['company']);
  });
  it('covers columns, one sort and the page size of a large list', () => {
    const t = listLayoutTarget(deals.list);
    expect(t.standard).toEqual({ columns: ['deal', 'name', 'product', 'counterparty', 'amount', 'currency', 'start', 'status'], sort: [{ col: 'deal', desc: true }], subtotals: [], unit: null, subtotalsOnly: false, pageSize: 50 });
    expect(t.sortColumns).toEqual(['deal', 'name', 'amount', 'start', 'product', 'counterparty', 'currency', 'status']);
    expect(normalizeLayout({ columns: ['amount'], pageSize: 75, subtotals: ['product'] }, t)).toMatchObject({ columns: ['amount'], pageSize: 50, subtotals: [] });
    expect(normalizeLayout({ columns: ['amount'], pageSize: 100, sort: [{ col: 'amount', desc: true }, { col: 'deal' }] }, t)).toMatchObject({ pageSize: 100, sort: [{ col: 'amount', desc: true }] });
  });
});

describe('checkLayoutInput', () => {
  it('accepts a valid layout and trims its name', () => {
    expect(checkLayoutInput(input({ unit: 'LAKHS' }, { name: '  By company ', description: ' Groups ', isDefault: true }), target))
      .toEqual({ name: 'By company', description: 'Groups', scope: 'shared', isDefault: true, layout: { ...standard, unit: 'LAKHS' } });
  });
  it('refuses an unknown column, too many sorts and a subtotal on an amount (400)', () => {
    expect(() => checkLayoutInput(input({ columns: ['company', 'gone'] }), target)).toThrow('Unknown column gone.');
    const two = reportLayoutTarget(columns, standard, { maxSort: 2 });
    expect(() => checkLayoutInput(input({ sort: [{ col: 'company', desc: false }, { col: 'payDate', desc: false }, { col: 'amount', desc: true }] }), two)).toThrow('Sort by at most 2 columns.');
    expect(() => checkLayoutInput(input({ subtotals: ['amount'] }), target)).toThrow('Subtotals are allowed on text columns only (Amount).');
    expect(() => checkLayoutInput(input({ columns: [] }), target)).toThrow('Choose at least one column.');
    let status = 0;
    try { checkLayoutInput(input({ columns: ['gone'] }), target); } catch (e) { status = (e as { status: number }).status; }
    expect(status).toBe(400);
  });
  it('refuses a bad name, scope, unit and subtotal-only flag', () => {
    expect(() => checkLayoutInput(input({}, { name: 'x'.repeat(41) }), target)).toThrow('Enter a layout name of at most 40 characters.');
    expect(() => checkLayoutInput(input({}, { name: 'a\u0007b' }), target)).toThrow('The layout name contains a control character.');
    expect(() => checkLayoutInput(input({}, { scope: 'everyone' }), target)).toThrow('Choose shared or personal.');
    expect(() => checkLayoutInput(input({ unit: 'MILES' }), target)).toThrow('Unknown unit MILES.');
    expect(() => checkLayoutInput(input({ subtotals: [], subtotalsOnly: true }), target)).toThrow('Subtotal lines only needs at least one subtotal.');
  });
  it('allows a page size and no subtotals on a large list', () => {
    const t = listLayoutTarget(deals.list);
    expect(() => checkLayoutInput({ name: 'x', scope: 'personal', layout: { ...t.standard, pageSize: 75 } }, t)).toThrow('Page size must be one of 50, 100, 200.');
    expect(() => checkLayoutInput({ name: 'x', scope: 'personal', layout: { ...t.standard, subtotals: ['product'] } }, t)).toThrow('This list has no subtotals.');
    expect(checkLayoutInput({ name: 'x', scope: 'personal', layout: { ...t.standard, pageSize: 100 } }, t).layout.pageSize).toBe(100);
  });
});

describe('sorting and grouping', () => {
  it('sorts by the subtotal columns first, then the sort; numbers numerically, blanks last', () => {
    expect(sortLayoutRows(rows, grouped, columns).map(r => r.payDate)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']);
    expect(sortLayoutRows(rows, { ...grouped, subtotals: ['company'], sort: [{ col: 'company', desc: true }] }, columns)[0].company).toBe('2000');
    expect(sortLayoutRows(rows, { ...grouped, subtotals: [], sort: [{ col: 'amount', desc: true }] }, columns).map(r => r.amount)).toEqual(['100.10', '50.00', '25.00', '0.20', '0.10']);
    const blanks = [{ amount: '' }, { amount: '2.00' }, { amount: '10.00' }];
    expect(sortLayoutRows(blanks, { ...grouped, subtotals: [], sort: [{ col: 'amount', desc: false }] }, columns).map(r => r.amount)).toEqual(['2.00', '10.00', '']);
    expect(sortLayoutRows(blanks, { ...grouped, subtotals: [], sort: [{ col: 'amount', desc: true }] }, columns).map(r => r.amount)).toEqual(['10.00', '2.00', '']);
  });
  it('subtotals and the grand total sum per currency exactly', () => {
    const model = alvModel(columns, grouped, rows);
    expect(model.visible.map(c => c.id)).toEqual(['company', 'counterparty', 'amount', 'currency']);
    expect(subtotals(model.grid).map(l => [l.level, l.value, l.count, l.totals.map(t => `${t.currency} ${t.sums.amount}`)])).toEqual([
      [1, 'CP001', 3, ['INR 0.30', 'USD 25.00']],
      [1, 'CP002', 1, ['USD 50.00']],
      [0, '1000', 4, ['INR 0.30', 'USD 75.00']],
      [1, 'CP002', 1, ['INR 100.10']],
      [0, '2000', 1, ['INR 100.10']]
    ]);
    expect(model.totals.map(t => `${t.currency} ${t.sums.amount}`)).toEqual(['INR 100.40', 'USD 75.00']);
    expect(subtotalLabel(subtotals(model.grid)[0])).toBe('Counterparty: CP001 - Axis Finance');
    expect(subtotalLabel(subtotals(model.grid)[2])).toBe('Company Code: 1000');
  });
  it('collapses a group to its subtotal line and shows subtotal lines only', () => {
    const folded = alvModel(columns, grouped, rows, new Set(['\u0001company=1000'])).grid;
    expect(folded.map(l => (l.type === 'row' ? 'row' : `${l.level}${l.collapsed ? '+' : ''}`))).toEqual(['0+', 'row', '1', '0']);
    expect(alvModel(columns, { ...grouped, subtotalsOnly: true }, rows).grid.every(l => l.type === 'subtotal')).toBe(true);
    expect([...toggleKey(new Set(['a']), 'a')]).toEqual([]);
    expect([...toggleKey(new Set(['a']), 'b')]).toEqual(['a', 'b']);
  });
});

describe('subtotals on values that differ only by case', () => {
  it('give one subtotal line per exact value with unique keys and exact sums', () => {
    const cols: ReportColumn[] = [{ id: 'name', label: 'Name', type: 'text' }, { id: 'd', label: 'Date', type: 'date' }, { id: 'amt', label: 'Amount', type: 'amount', currencyField: 'cur' }];
    const rs: Row[] = [{ name: 'abc', d: '2026-01-01', amt: '0.10', cur: 'INR' }, { name: 'ABC', d: '2026-01-02', amt: '1.00', cur: 'INR' }, { name: 'abc', d: '2026-01-03', amt: '0.20', cur: 'INR' }];
    const lines = subtotals(alvModel(cols, { columns: ['name', 'amt'], sort: [{ col: 'd', desc: false }], subtotals: ['name'], unit: null, subtotalsOnly: false }, rs).grid);
    expect(lines.map(l => [l.value, l.count, l.totals[0].sums.amt])).toEqual([['ABC', 1, '1.00'], ['abc', 2, '0.30']]);
    expect(new Set(lines.map(l => l.key)).size).toBe(2);
  });
});

describe('amount scale and subtotal labels', () => {
  it('sums 3-decimal amounts of a column with scale 3 (none is left out of subtotals or totals)', () => {
    const cols: ReportColumn[] = [{ id: 'company', label: 'Company Code', type: 'code' }, { id: 'amt', label: 'Amount', type: 'amount', currencyField: 'cur', scale: 3 }];
    const rs: Row[] = [{ company: '1000', amt: '1.125', cur: 'KWD' }, { company: '1000', amt: '2.250', cur: 'KWD' }, { company: '2000', amt: '0.005', cur: 'KWD' }];
    const model = alvModel(cols, { columns: ['company', 'amt'], sort: [], subtotals: ['company'], unit: null, subtotalsOnly: false }, rs);
    expect(subtotals(model.grid).map(l => l.totals[0].sums.amt)).toEqual(['3.375', '0.005']);
    expect(model.totals).toEqual([{ currency: 'KWD', sums: { amt: '3.380' } }]);
  });
  it('does not repeat a text equal to its code (SAP sends the key as the text)', () => {
    expect(subtotalLabel({ label: 'Counterparty', value: 'CP001', text: 'CP001' })).toBe('Counterparty: CP001');
    expect(subtotalLabel({ label: 'Counterparty', value: 'CP001', text: 'Axis Finance' })).toBe('Counterparty: CP001 - Axis Finance');
    expect(subtotalLabel({ label: 'Counterparty', value: '', text: '' })).toBe('Counterparty: (blank)');
  });
});

describe('defaultLayout', () => {
  const saved = (name: string, scope: 'shared' | 'personal', isDefault: boolean): SavedLayout => ({ name, description: '', scope, isDefault, layout: standard, changedBy: 'X', changedOn: '' });
  it('opens the personal default, else the shared default, else the Standard layout', () => {
    expect(defaultLayout([saved('S', 'shared', true), saved('P', 'personal', true)])?.name).toBe('P');
    expect(defaultLayout([saved('S', 'shared', true), saved('P', 'personal', false)])?.name).toBe('S');
    expect(defaultLayout([saved('S', 'shared', false)])).toBeNull();
  });
});
