// Excel and CSV of exactly what a report shows (spec §3.4): a header block (title, selection, run time, unit), a first
// "Level" column, the shown columns in order, amounts in the display unit as plain numbers (number cells in Excel). Pure.
import { formatDate } from '@/lib/fields/parse';
import type { Row } from '@/lib/grid/types';
import type { Total } from '@/lib/items/totals';
import { subtotalLabel, type GridLine } from '@/lib/layout/layout';
import { csvText, exportCell, rowStyleOf } from './report';
import type { ColumnType, FormattedReport, ReportColumn, Unit } from './types';
import { inUnit } from './units';

export interface ExportLine { level: string; cells: Row }
export interface ReportSheet { title: string; selectionText: string; readAt: string; unit: Unit; columns: ReportColumn[]; lines: ExportLine[] }

/** '2026-10-12T09:05:31.000Z' → '12-10-2026 09:05 UTC' (the server's read time). */
export const readAtText = (iso: string): string => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? `${formatDate(iso.slice(0, 10))} ${iso.slice(11, 16)} UTC` : iso);

/** A sheet cell: text, or a number (an amount or percent cell holding a plain number). */
export type SheetCell = string | { number: string };
const NUMBER = /^-?\d+(\.\d+)?$/;
const NUMERIC = new Set<ColumnType>(['amount', 'percent', 'rate']);

/** The sheet with typed cells, for Excel: amounts and percents are number cells (Excel sums them), all else text. */
export function sheetCells(s: ReportSheet): SheetCell[][] {
  const cell = (c: ReportColumn, v: string): SheetCell => (NUMERIC.has(c.type) && NUMBER.test(v) ? { number: v } : v);
  return [
    [s.title], [s.selectionText], [`Run at ${readAtText(s.readAt)}`], [`Amounts in ${s.unit.label}`], [],
    ['Level', ...s.columns.map(c => c.label)],
    ...s.lines.map(l => [l.level, ...s.columns.map(c => cell(c, l.cells[c.id] ?? ''))])
  ];
}

/** The sheet as CSV text: numbers as they are; text and code cells that would read as a formula get an apostrophe. */
export function sheetRows(s: ReportSheet): string[][] {
  return [
    [s.title], [s.selectionText], [`Run at ${readAtText(s.readAt)}`], [`Amounts in ${s.unit.label}`], [],
    ['Level', ...s.columns.map(c => c.label)],
    ...s.lines.map(l => [l.level, ...s.columns.map(c => csvText(c.type, l.cells[c.id] ?? ''))])
  ];
}

/** The id column of a formatted report as an export column. */
export const idColumn = (report: FormattedReport): ReportColumn => ({ id: report.idField, label: report.idLabel ?? 'ID', type: 'text' });

/** A formatted report's shown rows; the Level is the row style (blank for normal rows). */
export function formattedLines(report: FormattedReport, rows: Row[], unit: Unit): ExportLine[] {
  const columns = [idColumn(report), ...report.columns];
  return rows.map(r => {
    const style = rowStyleOf(report, r);
    return { level: style === 'normal' ? '' : style, cells: Object.fromEntries(columns.map(c => [c.id, exportCell(c, r, unit, style === 'percent')])) };
  });
}

/** An ALV grid: detail rows (blank Level), subtotal lines ('*' per level) and totals ('Total'), one line per currency. */
export function gridLines(grid: GridLine[], totals: Total[], visible: ReportColumn[], unit: Unit): ExportLine[] {
  const labelAt = visible.find(c => c.type !== 'amount')?.id;
  const currencyCols = new Set(visible.filter(c => c.type === 'amount' && c.currencyField).map(c => c.currencyField as string));
  // As on screen (AlvGrid): without a visible currency column after the label, a sum line names its currency in the label.
  const firstAmount = visible.findIndex(c => c.type === 'amount');
  const curInLabel = !visible.slice(firstAmount < 0 ? visible.length : firstAmount).some(c => currencyCols.has(c.id));
  const sumLine = (level: string, label: string, t: Total | undefined, count = ''): ExportLine => {
    const text = `${label}${curInLabel && t?.currency ? ` ${t.currency}` : ''}${count}`;
    return {
      level,
      cells: Object.fromEntries(visible.map(c => {
        if (c.type === 'amount') return [c.id, t ? inUnit(t.sums[c.id] ?? '0.00', unit.divisor) : ''];
        if (currencyCols.has(c.id)) return [c.id, t?.currency ?? ''];
        return [c.id, c.id === labelAt ? text : ''];
      }))
    };
  };
  const out: ExportLine[] = [];
  for (const line of grid) {
    if (line.type === 'row') { out.push({ level: '', cells: Object.fromEntries(visible.map(c => [c.id, exportCell(c, line.row, unit)])) }); continue; }
    const count = ` (${line.count} ${line.count === 1 ? 'row' : 'rows'})`;
    for (const t of line.totals.length ? line.totals : [undefined]) out.push(sumLine('*'.repeat(line.level + 1), subtotalLabel(line), t, count));
  }
  for (const t of totals.length ? totals : [undefined]) out.push(sumLine('Total', 'Total', t));
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "sample-cashflow-20261012.xlsx" (the local date of the export). */
export const exportName = (moduleId: string, now: Date, ext: 'xlsx' | 'csv'): string =>
  `${moduleId}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.${ext}`;
