// tests/unit/report.test.ts
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import { cellText, checkReportSelection, childrenOf, csvText, exportCell, maxRowsOf, reportFilters, reportList, ROW_CLASS, rowStyleOf, searchRows, selectionText, visibleFormatted } from '@/lib/report/report';
import { DEFAULT_UNITS, type FormattedReport, type ReportColumn, type RowStyle } from '@/lib/report/types';
import type { ReportModuleDef } from '@/modules/types';

const STYLE: Record<string, RowStyle> = { H: 'heading', P: 'percent', B: 'bogus' as RowStyle };
const report: FormattedReport = {
  variant: 'formatted', entity: 'statement', idField: 'id', orderBy: 'seq', parent: { by: 'prefix', separator: ':' },
  style: r => STYLE[r.rowStyle] ?? 'normal', hideFlag: { field: 'split', label: 'Hide split rows' }, fields: ['rowStyle', 'split'],
  columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1–7 days', type: 'amount', drillable: true }, { id: 'total', label: 'Total', type: 'amount', drillable: true }]
};
const rows: Row[] = [
  { id: 'A', name: 'Outflows', rowStyle: 'H', b1: '300.00', total: '300.00', split: '' },
  { id: 'A:01', name: 'Loans', rowStyle: '', b1: '200.00', total: '200.00', split: '' },
  { id: 'A:01:01', name: 'Term', rowStyle: '', b1: '200.00', total: '200.00', split: '' },
  { id: 'A:02', name: 'Interest', rowStyle: '', b1: '0.00', total: '0.00', split: 'X' },
  { id: 'A:03', name: 'Fees', rowStyle: '', b1: '100.00', total: '100.00', split: 'X' },
  { id: 'E', name: 'Ratio', rowStyle: 'P', b1: '-17.54', total: '' }
];
const def: ReportModuleDef<unknown> = {
  kind: 'report', id: 'r', title: 'R', serviceKey: 's', storageKey: 'k', lookups: () => ({}),
  breakdownOpens: 'popup',
  selection: [{ field: 'company', label: 'Company Code *', type: 'code', max: 4, required: true }, { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }],
  check: s => (s.year && s.year < '2020' ? [{ field: 'year', message: 'Choose 2020 or later.' }] : []),
  report
};
const ids = (list: Row[]) => list.map(r => r.id);

describe('report date filters', () => {
  const mk = (selection: ReportModuleDef<unknown>['selection'], extra: Partial<FormattedReport> = {}): ReportModuleDef<unknown> => ({ ...def, selection, report: { ...report, ...extra } });
  it('turns a date range selection (two fields) into one between filter', () => {
    const two = mk([{ field: 'posted', label: 'Posting Date', type: 'dateRange', toField: 'postedTo' }]);
    expect(reportFilters(two, { posted: '2026-01-01', postedTo: '2026-03-31' })).toEqual([{ field: 'posted', op: 'between', values: ['2026-01-01', '2026-03-31'] }]);
    expect(reportFilters(two, { posted: '2026-01-01', postedTo: '' })).toEqual([{ field: 'posted', op: 'between', values: ['2026-01-01', ''] }]);
    expect(reportFilters(two, { posted: '', postedTo: '' })).toEqual([]);
    // A range without toField has no end field: it does not filter (and never throws).
    const one = mk([{ field: 'posted', label: 'Posting Date', type: 'dateRange' }]);
    expect(reportFilters(one, { posted: '2026-01-01..2026-03-31' })).toEqual([]);
    expect(reportList(two).filters).toContain('posted');
  });
  const win = { field: 'dueDate', keyDate: 'keyDate', days: 'days' };
  const windowed = mk([{ field: 'company', label: 'Company', type: 'code', max: 4 }, { field: 'keyDate', label: 'Key Date', type: 'date' }, { field: 'days', label: 'Days', type: 'integer', max: 4 }], { window: win });
  it('turns a filled window into a between filter from the key date over the days', () => {
    expect(reportFilters(windowed, { company: '1000', keyDate: '2026-10-31', days: '90' })).toEqual([
      { field: 'company', op: 'eq', values: ['1000'] }, { field: 'dueDate', op: 'between', values: ['2026-10-31', '2027-01-29'] }
    ]);
    expect(reportFilters(windowed, { keyDate: '2026-10-31', days: '' })).toEqual([]);
    expect(reportFilters(windowed, { keyDate: '', days: '90' })).toEqual([]);
    expect(reportFilters(windowed, { keyDate: '2026-10-31', days: 'abc' })).toEqual([]);
  });
  it('whitelists the window target field and keeps the window inputs out of the plain filters', () => {
    const list = reportList(windowed);
    expect(list.filters).toContain('dueDate');
    expect(list.filters).not.toContain('keyDate');
    expect(list.filters).not.toContain('days');
    expect(list.fields.find(d => d.field === 'dueDate')?.type).toBe('date');
  });
  it('refuses a non-numeric days value in the selection check', () => {
    expect(checkReportSelection(windowed, { company: '1000', keyDate: '2026-10-31', days: 'abc' }, {}).problems.length).toBeGreaterThan(0);
  });
});

describe('formatted rows', () => {
  it('maps styles to ALM row classes; an unknown style is normal', () => {
    expect(rowStyleOf(report, rows[0])).toBe('heading');
    expect(rowStyleOf(report, { rowStyle: 'B' })).toBe('normal');
    expect(ROW_CLASS).toEqual({ heading: 'qr-heading', level1: 'qr-level1', normal: '', subtotal: 'qr-subtotal', total: 'qr-cumulative', percent: 'qr-percent', warn: 'qr-mismatch' });
  });
  it('hides zero normal rows unless asked, hides flagged rows, searches id and text', () => {
    const none = { showZero: false, hideFlagged: false, search: '' };
    expect(ids(visibleFormatted(report, rows, none))).toEqual(['A', 'A:01', 'A:01:01', 'A:03', 'E']);
    expect(ids(visibleFormatted(report, rows, { ...none, showZero: true }))).toHaveLength(6);
    expect(ids(visibleFormatted(report, rows, { ...none, showZero: true, hideFlagged: true }))).toEqual(['A', 'A:01', 'A:01:01', 'E']);
    expect(ids(visibleFormatted(report, rows, { ...none, search: 'TERM' }))).toEqual(['A:01:01']);
    expect(ids(visibleFormatted(report, rows, { ...none, search: 'a:0' }))).toEqual(['A:01', 'A:01:01', 'A:03']);
    // A formatted report without amount columns has no zero rows to hide.
    const textOnly: FormattedReport = { ...report, columns: [report.columns[0]] };
    expect(ids(visibleFormatted(textOnly, rows, none))).toHaveLength(6);
  });
  it('finds the direct children by prefix and by parent field', () => {
    expect(ids(childrenOf(report, rows, 'A'))).toEqual(['A:01', 'A:02', 'A:03']);
    expect(ids(childrenOf(report, rows, 'A:01'))).toEqual(['A:01:01']);
    expect(childrenOf(report, rows, 'E')).toEqual([]);
    const byField: FormattedReport = { ...report, parent: { by: 'field', field: 'up' } };
    expect(ids(childrenOf(byField, [{ id: 'T', up: '' }, { id: 'x', up: 'T' }, { id: 'y', up: 'T' }, { id: 'z', up: 'x' }], 'T'))).toEqual(['x', 'y']);
  });
  it('formats cells: amounts in the unit (zero blank), percent rows unscaled, codes with text, dates', () => {
    const lakhs = DEFAULT_UNITS[2];
    const amount = report.columns[1];
    expect(cellText(amount, { b1: '1234567.50' }, lakhs)).toBe('12.35');
    expect(cellText(amount, { b1: '0.00' }, lakhs)).toBe('');
    expect(cellText(amount, { b1: '-17.54' }, lakhs, true)).toBe('-17.54 %');
    const code: ReportColumn = { id: 'cp', label: 'Counterparty', type: 'code', textField: 'cpName' };
    expect(cellText(code, { cp: 'CP002', cpName: "O'Brien Capital" }, lakhs)).toBe("CP002 - O'Brien Capital");
    expect(cellText({ id: 'd', label: 'Date', type: 'date' }, { d: '2026-01-05' }, lakhs)).toBe('05-01-2026');
  });
  it('exports plain numbers in the unit; the CSV never writes a formula', () => {
    const lakhs = DEFAULT_UNITS[2];
    expect(exportCell(report.columns[1], { b1: '1234567.50' }, lakhs)).toBe('12.35');
    expect(exportCell(report.columns[1], { b1: '0.00' }, lakhs)).toBe('');
    expect(exportCell(report.columns[1], { b1: '0.00' }, lakhs, false, true)).toBe('0.00');
    // The cell keeps its text (an xlsx inline string is never a formula); the CSV guards it with an apostrophe.
    expect(exportCell(report.columns[0], { name: '=HYPERLINK("x")' }, lakhs)).toBe('=HYPERLINK("x")');
    expect(csvText('text', '=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(csvText('code', '-5 days')).toBe("'-5 days");
    expect(csvText('amount', '-5.00')).toBe('-5.00');
  });
  it('searches line items over codes, texts and descriptions', () => {
    const cols: ReportColumn[] = [{ id: 'cp', label: 'Counterparty', type: 'code', textField: 'cpName' }, { id: 'amount', label: 'Amount', type: 'amount' }];
    const lines = [{ cp: 'CP001', cpName: 'Axis Finance', amount: '1.00' }, { cp: 'CP002', cpName: "O'Brien Capital", amount: '2.00' }];
    expect(searchRows(lines, cols, "o'brien")).toEqual([lines[1]]);
    expect(searchRows(lines, cols, '2.00')).toEqual([]);
    expect(searchRows(lines, cols, ' ')).toEqual(lines);
  });
});

describe('the selection', () => {
  it('checks field types first, then the module rule', () => {
    expect(checkReportSelection(def, { company: '1000', month: '13', year: '2026' }, {}).problems).toEqual([{ field: 'month', message: "Period '13' is not a valid option." }]);
    expect(checkReportSelection(def, { company: '', month: '01', year: '2019' }, {}).problems).toEqual([{ field: 'company', message: 'Company Code is required' }]);
    const out = checkReportSelection(def, { company: '1000', month: '01', year: '2019', extra: 'x' }, {});
    expect(out.selection).toEqual({ company: '1000', month: '01', year: '2019' });
    expect(out.problems).toEqual([{ field: 'year', message: 'Choose 2020 or later.' }]);
  });
  it('filters by the filled selection fields and reads one page of maxRows + 1 in order', () => {
    expect(reportFilters(def, { company: '1000', month: '01', year: '' })).toEqual([
      { field: 'company', op: 'eq', values: ['1000'] }, { field: 'month', op: 'eq', values: ['01'] }
    ]);
    const list = reportList(def);
    expect(list).toMatchObject({ entity: 'statement', keys: ['seq'], defaultSort: { field: 'seq', dir: 1 }, pageSizes: [20001], filters: ['company', 'month', 'year'] });
    expect(list.fields.find(d => d.field === 'seq')?.type).toBe('integer');
    expect(list.fields.find(d => d.field === 'b1')?.scale).toBeUndefined();
    const kwd: FormattedReport = { ...report, columns: [{ id: 'b1', label: '1–7 days', type: 'amount', scale: 3 }] };
    expect(reportList({ ...def, report: kwd }).fields.find(d => d.field === 'b1')).toMatchObject({ type: 'amount', scale: 3 });
    expect(maxRowsOf({ ...def, report: { ...report, maxRows: 50 } })).toBe(50);
  });
  it('describes a selection for the header and the export', () => {
    expect(selectionText(def.selection, { company: '1000', month: '01', year: '2026' }, {})).toBe('1000 · 01-2026');
  });
});
