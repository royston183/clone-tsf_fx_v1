import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/client/csv';
import { readXlsx, unzip } from '@/lib/client/xlsx';
import { sheetXlsx } from '@/lib/client/xlsx-write';
import type { Row } from '@/lib/grid/types';
import { alvModel } from '@/lib/layout/layout';
import { exportName, formattedLines, gridLines, idColumn, readAtText, sheetCells, sheetRows } from '@/lib/report/export';
import { DEFAULT_UNITS, type FormattedReport, type LayoutState, type ReportColumn } from '@/lib/report/types';

const [ABSOLUTE, , LAKHS] = DEFAULT_UNITS;
const report: FormattedReport = {
  variant: 'formatted', entity: 'statement', idField: 'id', parent: { by: 'prefix', separator: ':' },
  style: r => (r.rowStyle === 'H' ? 'heading' : r.rowStyle === 'P' ? 'percent' : 'normal'),
  columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1–7 days', type: 'amount' }, { id: 'total', label: 'Total', type: 'amount' }]
};
const statement: Row[] = [
  { id: 'A', name: 'Outflows', rowStyle: 'H', b1: '1234567.50', total: '1234567.50' },
  { id: 'A:02', name: 'Interest', rowStyle: '', b1: '0.00', total: '0.00' },
  { id: 'E', name: 'Ratio', rowStyle: 'P', b1: '-17.54', total: '' }
];
const columns: ReportColumn[] = [
  { id: 'company', label: 'Company Code', type: 'code' },
  { id: 'counterparty', label: 'Counterparty', type: 'code', textField: 'cpName' },
  { id: 'payDate', label: 'Payment Date', type: 'date' },
  { id: 'amount', label: 'Amount', type: 'amount', currencyField: 'currency' },
  { id: 'currency', label: 'Currency', type: 'code' }
];
const lines: Row[] = [
  { company: '2000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-05', amount: '100.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-03', amount: '0.10', currency: 'INR' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-02', amount: '0.20', currency: 'INR' },
  { company: '1000', counterparty: 'CP002', cpName: "O'Brien Capital", payDate: '2026-01-04', amount: '50.00', currency: 'USD' },
  { company: '1000', counterparty: 'CP001', cpName: 'Axis Finance', payDate: '2026-01-01', amount: '25.00', currency: 'USD' }
];
const layout: LayoutState = { columns: ['company', 'counterparty', 'amount', 'currency'], sort: [{ col: 'payDate', desc: false }], subtotals: ['company', 'counterparty'], unit: null, subtotalsOnly: false };

describe('report export', () => {
  it('writes the header block, a Level column and the shown columns in the unit', () => {
    const sheet = sheetRows({ title: 'Liquidity Statement', selectionText: '1000 · 01-2026', readAt: '2026-10-12T09:05:31.000Z', unit: LAKHS, columns: [idColumn(report), ...report.columns], lines: formattedLines(report, statement, LAKHS) });
    expect(sheet).toEqual([
      ['Liquidity Statement'], ['1000 · 01-2026'], ['Run at 12-10-2026 09:05 UTC'], ['Amounts in Lakhs'], [],
      ['Level', 'ID', 'Group Name', '1–7 days', 'Total'],
      ['heading', 'A', 'Outflows', '12.35', '12.35'],
      ['', 'A:02', 'Interest', '', ''],
      ['percent', 'E', 'Ratio', '-17.54', '']
    ]);
  });
  it('exports one subtotal and one total line per currency', () => {
    const model = alvModel(columns, layout, lines);
    expect(gridLines(model.grid, model.totals, model.visible, ABSOLUTE).map(l => [l.level, l.cells.company, l.cells.amount, l.cells.currency])).toEqual([
      ['', '1000', '25.00', 'USD'],
      ['', '1000', '0.20', 'INR'],
      ['', '1000', '0.10', 'INR'],
      ['**', 'Counterparty: CP001 - Axis Finance (3 rows)', '0.30', 'INR'],
      ['**', 'Counterparty: CP001 - Axis Finance (3 rows)', '25.00', 'USD'],
      ['', '1000', '50.00', 'USD'],
      ['**', "Counterparty: CP002 - O'Brien Capital (1 row)", '50.00', 'USD'],
      ['*', 'Company Code: 1000 (4 rows)', '0.30', 'INR'],
      ['*', 'Company Code: 1000 (4 rows)', '75.00', 'USD'],
      ['', '2000', '100.10', 'INR'],
      ['**', "Counterparty: CP002 - O'Brien Capital (1 row)", '100.10', 'INR'],
      ['*', 'Company Code: 2000 (1 row)', '100.10', 'INR'],
      ['Total', 'Total', '100.40', 'INR'],
      ['Total', 'Total', '75.00', 'USD']
    ]);
  });
  it('names the currency in the label of every sum line when the layout hides the currency column', () => {
    const hidden: LayoutState = { ...layout, columns: ['company', 'amount'], subtotals: ['company'] };
    const model = alvModel(columns, hidden, lines);
    expect(gridLines(model.grid, model.totals, model.visible, ABSOLUTE).filter(l => l.level).map(l => [l.level, l.cells.company, l.cells.amount])).toEqual([
      ['*', 'Company Code: 1000 INR (4 rows)', '0.30'],
      ['*', 'Company Code: 1000 USD (4 rows)', '75.00'],
      ['*', 'Company Code: 2000 INR (1 row)', '100.10'],
      ['Total', 'Total INR', '100.40'],
      ['Total', 'Total USD', '75.00']
    ]);
  });
  it('writes amounts and percents as number cells for Excel; the CSV guards formula-looking text, Excel does not need to', async () => {
    const risky: Row[] = [{ id: '=A1', name: '-5 days', rowStyle: '', b1: '1234567.50', total: '1234567.50' }, ...statement];
    const sheet = { title: 'Liquidity Statement', selectionText: '1000 · 01-2026', readAt: '2026-10-12T09:05:31.000Z', unit: LAKHS, columns: [idColumn(report), ...report.columns], lines: formattedLines(report, risky, LAKHS) };
    const cells = sheetCells(sheet);
    expect(cells[6]).toEqual(['', '=A1', '-5 days', { number: '12.35' }, { number: '12.35' }]);
    expect(cells[8]).toEqual(['', 'A:02', 'Interest', '', '']);
    expect(cells[9]).toEqual(['percent', 'E', 'Ratio', { number: '-17.54' }, '']);
    expect(sheetRows(sheet)[6]).toEqual(['', "'=A1", "'-5 days", '12.35', '12.35']);
    const xml = new TextDecoder().decode((await unzip(sheetXlsx(cells, 'Liquidity').buffer))['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('<c r="D7" s="1"><v>12.35</v></c>');
    expect(xml).toContain('<c r="B7" t="inlineStr"><is><t>=A1</t></is></c>');
    expect(xml).not.toContain("'=A1");
    expect((await readXlsx(sheetXlsx(cells, 'Liquidity').buffer))[6].cells).toEqual(['', '=A1', '-5 days', '12.35', '12.35']);
  });
  it('names the file by module and local date, and writes CSV as Excel reads it', () => {
    expect(exportName('sample-cashflow', new Date(2026, 9, 12, 12), 'xlsx')).toBe('sample-cashflow-20261012.xlsx');
    expect(readAtText('soon')).toBe('soon');
    expect(toCsv([['a', 'b,c'], ['"q"', 'x\ny']])).toBe('a,"b,c"\r\n"""q""","x\ny"');
  });
});
