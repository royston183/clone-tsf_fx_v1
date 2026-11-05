// Real .xlsx files built in memory (deflated zip entries, as Excel writes them): strings shared or inline, numbers as
// numbers, null as no cell, [] as an empty self-closing row, optional merged cells and sheet order.
import { crc32, deflateRawSync } from 'node:zlib';

type Cell = string | number | null;
export interface FixtureSheet { name: string; rows: Cell[][]; inline?: boolean; merge?: string[] }

function zipDeflated(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8'), data = deflateRawSync(raw), n = Buffer.from(name, 'utf8'), crc = crc32(raw);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(8, 8); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(n.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(8, 10); dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(raw.length, 24); dir.writeUInt16LE(n.length, 28); dir.writeUInt32LE(offset, 42);
    parts.push(head, n, data);
    central.push(dir, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

/** `order` lists the sheets in workbook order (default: as given); files are always sheet1.xml, sheet2.xml, … */
export function xlsxFixture(sheets: FixtureSheet[], { order }: { order?: number[] } = {}): Buffer {
  const ns = 'http://schemas.openxmlformats.org/';
  const shared: string[] = [];
  const idx = (s: string) => { let i = shared.indexOf(s); if (i < 0) { i = shared.length; shared.push(s); } return i; };
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i: number) => String.fromCharCode(65 + i);
  const files: Record<string, string> = { '[Content_Types].xml': `<?xml version="1.0"?><Types xmlns="${ns}package/2006/content-types"/>` };
  sheets.forEach((sheet, n) => {
    const data = sheet.rows.map((cells, r) => (!cells.length ? `<row r="${r + 1}"/>` : `<row r="${r + 1}">${cells.map((v, c) => {
      const ref = `${col(c)}${r + 1}`;
      if (v === null) return '';
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      return sheet.inline ? `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>` : `<c r="${ref}" t="s"><v>${idx(v)}</v></c>`;
    }).join('')}</row>`)).join('');
    const merges = sheet.merge?.length ? `<mergeCells count="${sheet.merge.length}">${sheet.merge.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    files[`xl/worksheets/sheet${n + 1}.xml`] = `<?xml version="1.0"?><worksheet xmlns="${ns}spreadsheetml/2006/main"><sheetData>${data}</sheetData>${merges}</worksheet>`;
  });
  const listed = order ?? sheets.map((_, i) => i);
  files['xl/workbook.xml'] = `<?xml version="1.0"?><workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>${listed.map(i => `<sheet name="${sheets[i].name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0"?><Relationships xmlns="${ns}package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  files['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst xmlns="${ns}spreadsheetml/2006/main">${shared.map(s => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`;
  return zipDeflated(files);
}

export const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
