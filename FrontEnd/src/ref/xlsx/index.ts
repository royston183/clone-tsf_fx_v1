// The part of the `xlsx` (SheetJS) package the ported screens use, over the template's own zip / sheet code
// (lib/client/xlsx.ts reads, lib/client/xlsx-write.ts writes): no spreadsheet library.
//
// Differences from SheetJS the porters must know:
//   - `read` is asynchronous: call `await readAsync(data, opts)` (an .xlsx needs the browser's DecompressionStream).
//     It reads .xlsx / .xlsm and CSV / TSV / TXT text; the old binary .xls (BIFF) is not supported and throws.
//   - `write` / `writeFile` always produce an .xlsx workbook, whatever `bookType` says (name the file .xlsx).
//   - Cells: strings, numbers, booleans and Dates; `z` is the number format ('@' = text); '!cols' widths are written.
import { downloadFile, XLSX_TYPE, zip } from '@/lib/client/xlsx-write'
import { unzip } from '@/lib/client/xlsx'

export type CellObject = { t: 'n' | 's' | 'b' | 'e' | 'd'; v?: string | number | boolean | Date; z?: string; f?: string }
export type ColInfo = { wch?: number }
export type WorkSheet = { [cell: string]: unknown; '!ref'?: string; '!cols'?: ColInfo[] }
export type WorkBook = { SheetNames: string[]; Sheets: Record<string, WorkSheet>; Workbook?: { WBProps?: { date1904?: boolean } } }
export type Range = { s: { r: number; c: number }; e: { r: number; c: number } }
export type CellAddress = { r: number; c: number }

const columnName = (c: number): string => { let s = ''; for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
const columnIndex = (name: string): number => [...name].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

function encode_cell(a: CellAddress): string { return `${columnName(a.c)}${a.r + 1}` }
function decode_cell(ref: string): CellAddress {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) throw new Error(`Invalid cell address ${ref}`)
  return { r: Number(m[2]) - 1, c: columnIndex(m[1] ?? '') }
}
function decode_range(ref: string): Range {
  const [from = '', to = from] = ref.split(':')
  return { s: decode_cell(from), e: decode_cell(to) }
}
function encode_range(r: Range): string { return `${encode_cell(r.s)}:${encode_cell(r.e)}` }

function cellOf(value: unknown): CellObject | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value instanceof Date) return { t: 'd', v: value }
  if (typeof value === 'number') return { t: 'n', v: value }
  if (typeof value === 'boolean') return { t: 'b', v: value }
  return { t: 's', v: String(value) }
}

function aoa_to_sheet(rows: unknown[][]): WorkSheet {
  const sheet: WorkSheet = {}
  let columns = 0
  rows.forEach((row, r) => {
    columns = Math.max(columns, row.length)
    row.forEach((value, c) => { const cell = cellOf(value); if (cell) sheet[encode_cell({ r, c })] = cell })
  })
  if (rows.length && columns) sheet['!ref'] = encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: columns - 1 } })
  return sheet
}

/** Header row = the union of the keys in first-seen order, then one row per record. */
function json_to_sheet(records: Record<string, unknown>[]): WorkSheet {
  const keys: string[] = []
  for (const record of records) for (const key of Object.keys(record)) if (!keys.includes(key)) keys.push(key)
  return aoa_to_sheet([keys, ...records.map(record => keys.map(key => record[key]))])
}

const book_new = (): WorkBook => ({ SheetNames: [], Sheets: {} })
function book_append_sheet(workbook: WorkBook, sheet: WorkSheet, name = `Sheet${workbook.SheetNames.length + 1}`): void {
  if (workbook.SheetNames.includes(name)) throw new Error(`The workbook already has a sheet named ${name}.`)
  workbook.SheetNames.push(name)
  workbook.Sheets[name] = sheet
}

/** The text SheetJS shows for a cell: a number with a zero-padding format ('000') keeps its leading zeros. */
function format_cell(cell: CellObject): string {
  const v = cell.v
  if (v === undefined || v === null) return ''
  if (typeof v === 'number' && typeof cell.z === 'string' && /^0+$/.test(cell.z)) return String(Math.trunc(v)).padStart(cell.z.length, '0')
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

// ---------------------------------------------------------------------------------------------------------- dates

const EXCEL_EPOCH = Date.UTC(1899, 11, 30)
/** The calendar parts of an Excel serial (1900 date system by default). */
function parse_date_code(serial: number, opts: { date1904?: boolean } = {}): { y: number; m: number; d: number; H: number; M: number; S: number } | null {
  if (!Number.isFinite(serial) || serial < 0) return null
  const days = Math.floor(serial)
  const ms = Math.round((serial - days) * 86400000)
  const date = new Date((opts.date1904 ? Date.UTC(1904, 0, 1) : EXCEL_EPOCH) + days * 86400000)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), H: Math.floor(ms / 3600000), M: Math.floor(ms / 60000) % 60, S: Math.floor(ms / 1000) % 60 }
}
const serialOf = (date: Date): number => (date.getTime() - EXCEL_EPOCH) / 86400000

export const SSF = { parse_date_code }
export const utils = { book_new, book_append_sheet, aoa_to_sheet, json_to_sheet, encode_cell, decode_cell, decode_range, encode_range, format_cell }

// ---------------------------------------------------------------------------------------------------------- write

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
// Characters XML 1.0 cannot carry are dropped.
const xml = (s: string): string => s.replace(/[^\P{Cc}\t\n\r]/gu, '').replace(/[&<>"]/g, ch => ESCAPES[ch] ?? ch)
const NS = 'http://schemas.openxmlformats.org/'
const REL = `${NS}officeDocument/2006/relationships`
// Cell formats: 0 General, 1 text (@), 2 date (yyyy-mm-dd).
const STYLES = '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'

function sheetXml(sheet: WorkSheet): string {
  const cells = Object.keys(sheet).filter(k => !k.startsWith('!')).map(k => ({ at: decode_cell(k), cell: sheet[k] as CellObject }))
  const rows = new Map<number, { at: CellAddress; cell: CellObject }[]>()
  for (const entry of cells) (rows.get(entry.at.r) ?? rows.set(entry.at.r, []).get(entry.at.r))!.push(entry)
  const data = [...rows.entries()].sort(([a], [b]) => a - b).map(([r, row]) => `<row r="${r + 1}">${row.sort((a, b) => a.at.c - b.at.c).map(({ at, cell }) => {
    const ref = encode_cell(at), v = cell.v
    if (v === undefined || v === null) return cell.z === '@' ? `<c r="${ref}" s="1"/>` : ''
    if (v instanceof Date || cell.t === 'd') return `<c r="${ref}" s="2"><v>${serialOf(v instanceof Date ? v : new Date(String(v)))}</v></c>`
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
    if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`
    return `<c r="${ref}" t="inlineStr"${cell.z === '@' ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`
  }).join('')}</row>`).join('')
  const cols = (sheet['!cols'] ?? []).map((c, i) => (c?.wch ? `<col min="${i + 1}" max="${i + 1}" width="${c.wch}" customWidth="1"/>` : '')).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${data}</sheetData></worksheet>`
}

/** The workbook as .xlsx bytes (`bookType` is ignored; the type is always 'array'). */
function write(workbook: WorkBook, opts?: { bookType?: string; type?: 'array' }): ArrayBuffer {
  void opts
  if (!workbook.SheetNames.length) throw new Error('The workbook has no sheet.')
  const n = workbook.SheetNames.length
  const sheets = workbook.SheetNames.map((name, i) => `<sheet name="${xml(name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
  const entries: Record<string, string> = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${workbook.SheetNames.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${sheets}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}package/2006/relationships">${workbook.SheetNames.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}spreadsheetml/2006/main">${STYLES}</styleSheet>`
  }
  workbook.SheetNames.forEach((name, i) => { entries[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(workbook.Sheets[name] ?? {}) })
  return zip(entries).buffer
}

/** Saves the workbook in the browser (call from an event handler). */
function writeFile(workbook: WorkBook, filename: string): void {
  downloadFile(filename, new Uint8Array(write(workbook)), XLSX_TYPE)
}

export { write, writeFile }

// ----------------------------------------------------------------------------------------------------------- read

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unescapeXml = (s: string): string => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#'
  ? String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : XML_ENTITIES[e] ?? m))
const textOf = (xmlText: string): string => [...xmlText.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1] ?? '')).join('')

const BUILTIN_FORMATS: Record<number, string> = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'm/d/yy', 22: 'm/d/yy h:mm', 49: '@' }
const isDateFormat = (id: number, code: string | undefined): boolean => (id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (code !== undefined && /[ymdhs]/i.test(code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '')) && !/^[#0,.%?@ ]+$/.test(code))

type ReadOptions = { cellDates?: boolean; cellNF?: boolean; raw?: boolean }

async function readXlsxWorkbook(buffer: ArrayBuffer, opts: ReadOptions): Promise<WorkBook> {
  const files = await unzip(buffer)
  const text = (name: string): string => (files[name] ? new TextDecoder().decode(files[name]) : '')
  const workbookXml = text('xl/workbook.xml')
  if (!workbookXml) throw new Error('This is not an .xlsx workbook.')
  const rels = new Map<string, string>()
  for (const [tag] of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(tag)?.[1], target = /\bTarget="([^"]+)"/.exec(tag)?.[1]
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`)
  }
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si\b(?:\/>|[^>]*>([\s\S]*?)<\/si>)/g)].map(m => textOf((m[1] ?? '').replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')))
  // Number format code per cell style index.
  const customFormats = new Map<number, string>()
  for (const [tag] of text('xl/styles.xml').matchAll(/<numFmt\b[^>]*>/g)) {
    const id = /\bnumFmtId="(\d+)"/.exec(tag)?.[1], code = /\bformatCode="([^"]*)"/.exec(tag)?.[1]
    if (id && code !== undefined) customFormats.set(Number(id), unescapeXml(code))
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(text('xl/styles.xml'))?.[1] ?? ''
  const styles = [...cellXfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)].map(m => Number(/\bnumFmtId="(\d+)"/.exec(m[0])?.[1] ?? 0))
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbookXml)

  const workbook: WorkBook = { SheetNames: [], Sheets: {}, Workbook: { WBProps: { date1904 } } }
  for (const [tag] of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(tag)?.[1] ?? `Sheet${workbook.SheetNames.length + 1}`)
    const rid = /\br:id="([^"]+)"/.exec(tag)?.[1]
    const sheetXmlText = text(rid ? rels.get(rid) ?? '' : '')
    if (!sheetXmlText) continue
    const sheet: WorkSheet = {}
    let maxR = -1, maxC = -1, minR = Infinity, minC = Infinity
    for (const [, rowAttrs, body = ''] of sheetXmlText.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      let next = 0
      const rowAt = Number(/\br="(\d+)"/.exec(rowAttrs ?? '')?.[1] ?? 0)
      for (const [, attrs = '', inner = ''] of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
        const at = ref ? decode_cell(ref) : { r: Math.max(rowAt - 1, 0), c: next }
        next = at.c + 1
        const type = /\bt="(\w+)"/.exec(attrs)?.[1]
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        const f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(inner)?.[1]
        const styleId = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? 0)
        const fmtId = styles[styleId] ?? 0
        const code = customFormats.get(fmtId) ?? BUILTIN_FORMATS[fmtId]
        let cell: CellObject | undefined
        if (type === 's') cell = { t: 's', v: shared[Number(v)] ?? '' }
        else if (type === 'inlineStr') cell = { t: 's', v: textOf(inner) }
        else if (type === 'str') cell = { t: 's', v: unescapeXml(v ?? '') }
        else if (type === 'b') cell = { t: 'b', v: v === '1' }
        else if (type === 'e') cell = { t: 'e', v: unescapeXml(v ?? '#VALUE!') }
        else if (v !== undefined) {
          const n = Number(v)
          cell = opts.cellDates && isDateFormat(fmtId, code) ? { t: 'd', v: new Date((date1904 ? Date.UTC(1904, 0, 1) : EXCEL_EPOCH) + Math.round(n * 86400000)) } : { t: 'n', v: n }
        }
        if (!cell) { if (f === undefined) continue; cell = { t: 's' } }
        if (code && opts.cellNF !== false) cell.z = code
        if (f !== undefined) cell.f = unescapeXml(f)
        sheet[encode_cell(at)] = cell
        minR = Math.min(minR, at.r); minC = Math.min(minC, at.c); maxR = Math.max(maxR, at.r); maxC = Math.max(maxC, at.c)
      }
    }
    if (maxR >= 0) sheet['!ref'] = encode_range({ s: { r: Math.min(minR, 0), c: Math.min(minC, 0) }, e: { r: maxR, c: maxC } })
    workbook.SheetNames.push(name)
    workbook.Sheets[name] = sheet
  }
  if (!workbook.SheetNames.length) throw new Error('The workbook has no worksheet.')
  return workbook
}

/** Delimited text as a one-sheet workbook; every cell is a string. */
function readDelimited(text: string, delimiter: string): WorkBook {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"') { if (body[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  const sheet = aoa_to_sheet(rows)
  return { SheetNames: ['Sheet1'], Sheets: { Sheet1: sheet } }
}

/**
 * SheetJS `read(data, { type: 'array', cellDates, cellNF, raw })`, asynchronous. An .xlsx / .xlsm workbook (a zip) is read
 * cell by cell with types, formats and formulas; anything else is read as CSV (`,`, `;` or tab, by the first line).
 */
export async function readAsync(data: ArrayBuffer | Uint8Array, opts: ReadOptions = {}): Promise<WorkBook> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsxWorkbook(buffer, opts)
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('The binary .xls format is not supported. Save the file as .xlsx or CSV.')
  const text = new TextDecoder().decode(bytes)
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ','
  return readDelimited(text, delimiter)
}

export default { utils, SSF, readAsync, write, writeFile }
