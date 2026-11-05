import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/client/csv';
import { readUpload } from '@/lib/client/upload-file';
import { readXlsx } from '@/lib/client/xlsx';
import { sheetXlsx, zip } from '@/lib/client/xlsx-write';
import { toArrayBuffer, xlsxFixture } from '../support/xlsx-fixture';

describe('readXlsx', () => {
  it('reads shared strings, numbers and Excel date serials as text', async () => {
    const rows = await readXlsx(toArrayBuffer(xlsxFixture([{ name: 'Budget', rows: [['GL Account', 'Amount', 'Date'], ['400100', 125000.5, 45292]] }])));
    expect(rows).toEqual([{ line: 1, cells: ['GL Account', 'Amount', 'Date'] }, { line: 2, cells: ['400100', '125000.5', '45292'] }]);
  });
  it('reads inline strings and unescapes XML', async () => {
    const rows = await readXlsx(toArrayBuffer(xlsxFixture([{ name: 'S', inline: true, rows: [['A & B <C>', "O'Brien"]] }])));
    expect(rows[0].cells).toEqual(['A & B <C>', "O'Brien"]);
  });
  it('keeps empty and merged cells in place', async () => {
    const rows = await readXlsx(toArrayBuffer(xlsxFixture([{ name: 'S', rows: [['H1', 'H2', 'H3'], [null, 'only B', null], ['merged', null, 'C']], merge: ['A3:B3'] }])));
    expect(rows[1]).toEqual({ line: 2, cells: ['', 'only B'] });
    expect(rows[2]).toEqual({ line: 3, cells: ['merged', '', 'C'] });
  });
  it('reads the first sheet in workbook order and ignores the others', async () => {
    const reordered = xlsxFixture([{ name: 'Notes', rows: [['read me']] }, { name: 'Data', rows: [['GL Account'], ['400100']] }], { order: [1, 0] });
    expect((await readXlsx(toArrayBuffer(reordered))).map(r => r.cells[0])).toEqual(['GL Account', '400100']);
    const second = xlsxFixture([{ name: 'Data', rows: [['GL Account']] }, { name: 'Notes', rows: [['ignored']] }]);
    expect((await readXlsx(toArrayBuffer(second))).map(r => r.cells[0])).toEqual(['GL Account']);
  });
  it('reads an empty self-closing row without swallowing the next one', async () => {
    const rows = await readXlsx(toArrayBuffer(xlsxFixture([{ name: 'S', rows: [['H'], [], ['x']] }])));
    expect(rows).toEqual([{ line: 1, cells: ['H'] }, { line: 2, cells: [] }, { line: 3, cells: ['x'] }]);
  });
  it('refuses a file that is not an .xlsx', async () => {
    await expect(readXlsx(toArrayBuffer(Buffer.from('just text')))).rejects.toThrow('This is not an .xlsx file');
  });
  it('reads back the template it writes (codes keep their zeros)', async () => {
    const rows = await readXlsx(sheetXlsx([['GL Account', 'Amount'], ['007', '10']], 'Budget').buffer);
    expect(rows.map(r => r.cells)).toEqual([['GL Account', 'Amount'], ['007', '10']]);
  });
});

describe('parseCsv', () => {
  it('reads commas, quoted cells with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('a,b\r\n"1,5","say ""hi"""\r\n"two\nlines",x\r\n')).toEqual([['a', 'b'], ['1,5', 'say "hi"'], ['two\nlines', 'x']]);
  });
  it('takes semicolons or tabs from the heading and drops a BOM', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1,5\t2')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
});

describe('parseCsv delimiter', () => {
  it('ignores quoted delimiters, leading blank lines and quoted line breaks in the heading', () => {
    expect(parseCsv('"Amount, INR";Code\n1;X')).toEqual([['Amount, INR', 'Code'], ['1', 'X']]);
    expect(parseCsv('\n\na;b\n1,5;2').slice(2)).toEqual([['a', 'b'], ['1,5', '2']]);
    expect(parseCsv('"two\nlines, x";b\n1;2')).toEqual([['two\nlines, x', 'b'], ['1', '2']]);
  });
});

describe('readXlsx robustness', () => {
  const book = (shared: string, cells: string) => zip({
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': shared,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData><row r="1">${cells}</row></sheetData></worksheet>`
  });
  it('keeps shared string indexes when an entry is an empty <si/>', async () => {
    const rows = await readXlsx(book('<sst><si/><si><t>after</t></si></sst>', '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>').buffer);
    expect(rows[0].cells).toEqual(['', 'after']);
  });
  it('rejects a file whose declared unpacked size is over the cap, before inflating', async () => {
    const buf = Buffer.from(xlsxFixture([{ name: 'S', rows: [['a']] }]));
    for (let i = 0; i + 4 <= buf.length; i++) if (buf.readUInt32LE(i) === 0x02014b50) { buf.writeUInt32LE(60 * 1048576, i + 24); break; }
    await expect(readXlsx(toArrayBuffer(buf))).rejects.toThrow('The .xlsx file is too large once unpacked.');
  });
  it('reports damaged data and truncated zips as a damaged file', async () => {
    const buf = Buffer.from(xlsxFixture([{ name: 'S', rows: [['a']] }]));
    const bad = Buffer.from(buf);
    bad.fill(0xff, 40, 60);
    await expect(readXlsx(toArrayBuffer(bad))).rejects.toThrow('The .xlsx file is damaged.');
    await expect(readXlsx(toArrayBuffer(buf.subarray(buf.length - 22)))).rejects.toThrow('The .xlsx file is damaged.');
  });
});

describe('readUpload', () => {
  const defs = [{ field: 'gl', label: 'GL Account *', type: 'code' as const, key: true }, { field: 'amount', label: 'Amount *', type: 'amount' as const, required: true }];
  it('refuses .xls, other file types and files over the size limit before reading them', async () => {
    await expect(readUpload(new File(['x'], 'old.xls'), defs, { maxBytes: 100, maxRows: 10 })).rejects.toThrow('Save the file as .xlsx (Excel Workbook) or .csv.');
    await expect(readUpload(new File(['x'], 'notes.pdf'), defs, { maxBytes: 100, maxRows: 10 })).rejects.toThrow('Choose an .xlsx or .csv file.');
    await expect(readUpload(new File(['x'.repeat(200)], 'big.csv'), defs, { maxBytes: 100, maxRows: 10 })).rejects.toThrow('The file is larger than');
  });
  it('reads a csv into field values with their lines and enforces the row limit', async () => {
    const out = await readUpload(new File(['GL Account,Amount\n400100,"1,234.5"\n\n400200,7'], 'b.csv'), defs, { maxBytes: 1000, maxRows: 10 });
    expect(out.rows).toEqual([{ gl: '400100', amount: '1,234.5' }, { gl: '400200', amount: '7' }]);
    expect(out.lines).toEqual([2, 4]);
    await expect(readUpload(new File(['GL Account,Amount\n1,1\n2,2\n3,3'], 'b.csv'), defs, { maxBytes: 1000, maxRows: 2 })).rejects.toThrow('The file has 3 rows; upload at most 2 at a time.');
  });
});
