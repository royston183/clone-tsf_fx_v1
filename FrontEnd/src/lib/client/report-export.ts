// The browser side of report exports: the sheet of src/lib/report/export.ts as .xlsx (amounts and percents as number
// cells, the rest text) or .csv (UTF-8 BOM, formula-looking text guarded).
import { exportName, sheetCells, sheetRows, type ReportSheet } from '@/lib/report/export';
import { toCsv } from './csv';
import { downloadFile, sheetXlsx } from './xlsx-write';

/** Saves the sheet as `<module-id>-<yyyymmdd>.xlsx|csv` (call from an event handler). */
export function exportReport(format: 'xlsx' | 'csv', moduleId: string, sheet: ReportSheet, now: Date = new Date()): void {
  const name = exportName(moduleId, now, format);
  if (format === 'xlsx') { downloadFile(name, sheetXlsx(sheetCells(sheet), sheet.title.replace(/[[\]:*?/\\]/g, ' '))); return; }
  downloadFile(name, new TextEncoder().encode(`${String.fromCharCode(0xfeff)}${toCsv(sheetRows(sheet))}`) as Uint8Array<ArrayBuffer>, 'text/csv;charset=utf-8');
}
