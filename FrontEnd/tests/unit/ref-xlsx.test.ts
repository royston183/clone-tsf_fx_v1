import { describe, expect, it } from 'vitest';
import { readAsync, utils, write } from '@/ref/xlsx';
import { createUploadTemplate, parseUploadFile } from '@/ref/features/fx-blotter/upload-file';
import { UPLOAD_COLUMNS } from '@/ref/features/fx-blotter/upload-schema';

describe('reference workbook compatibility', () => {
  it('round-trips codes, numbers, booleans and dates in a real XLSX workbook', async () => {
    const workbook = utils.book_new();
    const date = new Date('2026-11-05T00:00:00Z');
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Code', 'Amount', 'Active', 'Date'], ['0007', 123.45, true, date]]), 'Deals');
    const result = await readAsync(write(workbook), { cellDates: true });
    expect(result.Sheets.Deals.A2).toMatchObject({ t: 's', v: '0007' });
    expect(result.Sheets.Deals.B2).toMatchObject({ t: 'n', v: 123.45 });
    expect(result.Sheets.Deals.C2).toMatchObject({ t: 'b', v: true });
    expect(result.Sheets.Deals.D2).toMatchObject({ t: 'd', v: date });
  });

  it('reads its exported blotter template and preserves text keys when uploading', async () => {
    const bytes = await createUploadTemplate();
    const workbook = await readAsync(bytes);
    expect(workbook.SheetNames).toEqual(['Upload', 'Instructions']);
    const input: Record<string, string> = { companyCode: '0001', bp: '0000000123', tradeDate: '05-11-2026', businessArea: '0002', txnType: '600', curr1: 'USD', amt1: '1000', curr2: 'INR', buySell: 'B', totalRate: '84.25' };
    workbook.Sheets.Upload = utils.aoa_to_sheet([UPLOAD_COLUMNS.map(c => c.header), UPLOAD_COLUMNS.map(c => input[c.field] ?? '')]);
    const rows = await parseUploadFile(write(workbook), 'blotter.xlsx');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(input);
  });

  it('rejects binary XLS with an actionable format message', async () => {
    await expect(parseUploadFile(new Uint8Array([0xd0, 0xcf]).buffer, 'old.xls')).rejects.toThrow(/Save binary XLS files as XLSX/);
  });
});
