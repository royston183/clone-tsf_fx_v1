import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { uploadService } from '@core/server/upload-service';
import { readXlsx } from '@/lib/client/xlsx';
import { matchColumns, toFieldValues } from '@/lib/upload/columns';
import { tradeflowUpload } from '@/modules/tradeflow-upload/definition';
import { tradeflowUploadSeed } from '@/modules/tradeflow-upload/seed';
import { MODULES } from '@/modules/registry';
import { actingAs, freshConfig, installTestPlatform, onSampleData } from '../support/platform';
import { toArrayBuffer, xlsxFixture } from '../support/xlsx-fixture';

installTestPlatform();

const HEADINGS = ['#', 'BL Notify Party', 'BL Number', 'BL Date', 'ETD', 'ETA', 'Contract Ref', 'Contract Date', 'Invoice Ref',
  'Invoice date', 'Main Commodity', 'Goods Details (Description)', 'Quantity', 'Kg / LBs / Mts'];
// Excel serials: 44964 = 2023-02-07, 44995 = 2023-03-10, 46061 = 2026-02-08.
const ROW = [1, 'Olam Viet Nam Ltd - BIEN HOA II', 'NAM6036645', 44964, 44964, 44995, 1490004320, null, 9230140002, 46061, 'ALMOND', 'ALMONDS BUTTE/PADRE SSR 36/40', 44000, 'LBS'];
const lk = tradeflowUpload.lookups(tradeflowUploadSeed().lookups);

async function rowsOf(rows: (string | number | null)[][]) {
  const sheet = await readXlsx(toArrayBuffer(xlsxFixture([{ name: 'Sheet1', rows: [HEADINGS, ...rows] }])));
  const matched = matchColumns(tradeflowUpload.columns, sheet);
  return { matched, rows: matched.rows.map(r => toFieldValues(tradeflowUpload.columns, r, lk)) };
}
const problems = (rows: Record<string, string>[]) => tradeflowUpload.check?.(rows, lk) ?? [];

describe('tradeflow-upload module (Tradeflows Upload)', () => {
  it('is registered as a create-only upload keyed by the shipping BL Number', () => {
    expect(MODULES['tradeflow-upload']).toBe(tradeflowUpload);
    expect(tradeflowUpload).toMatchObject({ kind: 'upload', entity: 'tradeflows', keys: ['blNumber'], mode: 'create', strict: false, maxRows: 1000 });
  });
  it('matches every heading of TF.xlsx and ignores the # column', async () => {
    const { matched } = await rowsOf([ROW]);
    expect(matched.ignored).toEqual(['#']);
    expect(Object.keys(matched.rows[0])).toHaveLength(13);
  });
  it('reads Excel dates and long references exactly', async () => {
    const { rows } = await rowsOf([ROW]);
    expect(rows[0]).toMatchObject({ blDate: '2023-02-07', eta: '2023-03-10', invoiceDate: '2026-02-08', contractRef: '1490004320', invoiceRef: '9230140002', contractDate: '' });
  });
  it('accepts a row with an empty Contract Date and a lower-case commodity', async () => {
    const { rows } = await rowsOf([ROW.map((v, i) => (i === 10 ? 'almond' : v))]);
    expect(rows[0].commodity).toBe('ALMOND');
    expect(problems(rows)).toEqual([]);
  });
  it('refuses an unmaintained commodity, a unit other than the commodity\'s and a zero quantity', () => {
    const base = { commodity: 'ALMOND', unit: 'LBS', quantity: '44000' };
    expect(problems([{ ...base, commodity: 'GOLD' }])).toEqual([{ row: 1, field: 'commodity', message: "Commodity 'GOLD' is not maintained. Add it in Maintain Commodity first." }]);
    expect(problems([{ ...base, unit: 'KG' }])).toEqual([{ row: 1, field: 'unit', message: "Unit KG does not match ALMOND's unit LBS." }]);
    expect(problems([{ ...base, quantity: '0' }])).toEqual([{ row: 1, field: 'quantity', message: 'Quantity must be greater than zero.' }]);
  });
  it('takes the unit only when the cell is LBS, KG or MTS, never a guess by its first letter', async () => {
    const unitOf = async (cell: string) => (await rowsOf([ROW.map((v, i) => (i === 13 ? cell : v))])).rows;
    const lbs = await unitOf('lbs');
    expect(lbs[0].unit).toBe('LBS');
    expect(problems(lbs)).toEqual([]);
    for (const cell of ['Ltr', 'Lot', 'M3', 'Kilolitre']) {
      const rows = await unitOf(cell);
      expect(rows[0].unit).not.toBe('LBS');
      expect(problems(rows)).toContainEqual(expect.objectContaining({ row: 1, field: 'unit' }));
    }
  });
  it('reads the real TF.xlsx', async () => {
    const file = readFileSync(path.join(__dirname, '../fixtures/tf-sample.xlsx'));
    const sheet = await readXlsx(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
    const matched = matchColumns(tradeflowUpload.columns, sheet);
    const rows = matched.rows.map(r => toFieldValues(tradeflowUpload.columns, r, lk));
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ blNumber: 'NAM6036645', blDate: '2023-02-07', quantity: '44000.000', unit: 'LBS' });
    expect(rows[1].quantity).toBe('264554.930');
    expect(problems(rows)).toEqual([]);
  });
});

describe('tradeflow upload on sample data', () => {
  onSampleData('tradeflow-upload');
  it('rejects a BL Number twice in one file', async () => {
    const { rows } = await rowsOf([ROW, ROW.map((v, i) => (i === 0 ? 2 : v))]);
    const check = await uploadService(freshConfig(), 'tradeflow-upload').check(actingAs(), { rows });
    expect(check.lines.map(l => [l.status, l.problems])).toEqual([['create', []], ['duplicate', ['Same key as row 1.']]]);
  });
  it('rejects a BL Number that is already stored', async () => {
    const { rows } = await rowsOf([ROW]);
    const svc = uploadService(freshConfig(), 'tradeflow-upload');
    expect(await svc.post(actingAs(), { rows })).toEqual({ created: 1, updated: 0, invalid: 0, duplicate: 0 });
    expect((await svc.check(actingAs(), { rows })).lines[0]).toMatchObject({ status: 'duplicate', problems: ['NAM6036645 already exists.'] });
  });
});
