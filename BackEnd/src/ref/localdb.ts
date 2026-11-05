// /api/ref/localdb/<resource>[/<key parts>]: the reference gateway's /api/localdb routes the FX screens use, with the same
// methods, query strings, bodies and answers. Most resources are middleware cloud tables (cloud-table.ts); tsf-fx-post-doc
// is the BackEnd's own table (migration 0005). A write is stamped with the acting user (x-app-user), never with the body's stamps.
import { actingUserOf, USER_HEADER } from '@core/server/http';
import {
  CURPAIR_COLUMNS, DAYLOCK_BLOTTER, DAYLOCK_CO_AREA, DAYLOCK_COLUMNS, DEALDMS_COLUMNS, DEALDMS_DATES, DEALDMS_TIMES, DMS_TYP_COLUMNS,
  FIELDS_COLUMNS, FX_POST_DOC_COLUMNS, FX_POST_DOC_TABLE, LIM_MAN_COLUMNS, TRD_ACC_COLUMNS, TRD_POS_COLUMNS
} from './columns';
import { cloudTable } from './cloud-table';
import { refDriver } from './driver';
import { DdicInputError, TableError, type DdicRow, type RefTable } from './ddic';
import type { RefDeps } from './middleware-proxy';
import { sqlTable } from './sql-table';

export const LOCALDB_PREFIX = '/api/ref/localdb';

class BadRequest extends Error {}
type Key = Record<string, string>;
type Row = Record<string, string | number | null>;

const LIMITS = { dealId: 15, seq: 2, fiType: 2, dmsCategory: 2, dmsType: 3, fxCompanyCode: 4, fxTransaction: 13 } as const;

/** The reference gateway's error body, `{ error: { message: { value } } }`, which the FrontEnd client reads. */
export const refError = (status: number, message: string): Response =>
  new Response(JSON.stringify({ error: { message: { value: message } } }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const send = (status: number, data?: unknown): Response =>
  new Response(data === undefined ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function required(value: unknown, name: keyof typeof LIMITS): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequest(`${name} is required.`);
  const text = value.trim();
  if (text.length > LIMITS[name]) throw new BadRequest(`${name} must be at most ${LIMITS[name]} characters.`);
  return text;
}

/** A query value that is at most one value (a repeated one is an error). */
function single(q: URLSearchParams, name: string): string | undefined {
  const all = q.getAll(name);
  if (all.length > 1) throw new BadRequest(`${name} must be a single value.`);
  return all[0] || undefined;
}

async function jsonObject(req: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try { value = JSON.parse(await req.text()); } catch { throw new BadRequest('The request body is not valid JSON.'); }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BadRequest('The request body must be a JSON object.');
  return value as Record<string, unknown>;
}

const STAMP_FIELDS = ['ZCREATED_BY', 'ZCREATED_DATE', 'ZCREATED_TIME', 'ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME'];
const pad = (n: number) => String(n).padStart(2, '0');
function sapStamp(now = new Date()): { date: string; time: string } {
  return { date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`, time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` };
}

interface Resource {
  /** The URL's name: /api/ref/localdb/<name>. */
  name: string;
  /** How many path parts name one row (0 for a read-only list). */
  parts: number;
  table(deps: RefDeps): RefTable;
  /** The row's key from its path parts (validated). */
  key?(parts: string[]): Key;
  /** GET on the collection (none: the reference gateway has no such route). */
  list?(table: RefTable, q: URLSearchParams): Promise<DdicRow[]>;
  /** Which of the row routes exist (the reference gateway's own set). */
  ops: { get?: boolean; put?: boolean; delete?: boolean };
  notFound?: string;
  /** Finds the row of a key (the day lock also looks for older zero-padded months, and fixes the key to the row found). */
  find?(table: RefTable, key: Key): Promise<DdicRow | undefined>;
  /** The fields a PUT writes (default: the body); the day lock ignores the body. */
  putFields?(req: Request): Promise<Record<string, unknown>>;
  /** Row shaping on the way in / out (the document slots speak ISO dates and times). */
  inRow?(body: Record<string, unknown>): Record<string, unknown>;
  outRow?(row: DdicRow): Row;
}

const whole = (table: RefTable): Promise<DdicRow[]> => table.list();
const filtered = (name: string) => (table: RefTable, q: URLSearchParams): Promise<DdicRow[]> => {
  const value = single(q, name);
  return table.list(value ? { column: name, value } : undefined);
};

// DEALDMS: dates as YYYY-MM-DD and times as HH:MM:SS on this API, YYYYMMDD / HHMMSS in the table.
const toSapDate = (v: unknown, name: string): unknown => {
  if (typeof v !== 'string' || !v || /^\d{8}$/.test(v)) return v;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequest(`${name} must be a date as YYYY-MM-DD.`);
  return v.replace(/-/g, '');
};
const toSapTime = (v: unknown, name: string): unknown => {
  if (typeof v !== 'string' || !v || /^\d{6}$/.test(v)) return v;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(v)) throw new BadRequest(`${name} must be a time as HH:MM:SS.`);
  return v.replace(/:/g, '');
};

const RESOURCES: Resource[] = [
  {
    // ZSGTSFTR_TRD_POS: Trade Invoice Posting Details, the settled / posted flags and invoice legs of a Deal ID.
    name: 'tsf-trade-position', parts: 2, ops: { get: true, put: true, delete: true }, notFound: 'No trade position for this Deal ID and sequence.',
    table: deps => cloudTable(deps, 'trdPos', TRD_POS_COLUMNS),
    key: p => ({ ZDEAL_ID: required(p[0], 'dealId'), ZSEQ: required(p[1], 'seq') }),
    list: filtered('ZDEAL_ID')
  },
  {
    // ZSGTSFTR_TRD_ACC: posting configuration by posting type.
    name: 'tsf-posting-type', parts: 1, ops: { get: true, put: true, delete: true }, notFound: 'No posting type with this code.',
    table: deps => cloudTable(deps, 'tsfTrdAcc', TRD_ACC_COLUMNS),
    key: p => ({ ZFI_TYPE: required(p[0], 'fiType') }),
    list: whole
  },
  {
    // ZSGTSFTR_DEALDMS: one slot per Deal ID + DMS category + type.
    name: 'tsf-deal-document', parts: 3, ops: { get: true, put: true, delete: true }, notFound: 'No document for this Deal ID, category and type.',
    table: deps => cloudTable(deps, 'tsfDealdms', DEALDMS_COLUMNS),
    key: p => ({ ZDEAL_ID: required(p[0], 'dealId'), ZDMS_CAT: required(p[1], 'dmsCategory'), ZDMS_TYPE: required(p[2], 'dmsType') }),
    async list(table, q) {
      const filter: Record<string, string> = {};
      for (const name of ['ZDEAL_ID', 'ZDMS_CAT', 'ZDMS_TYPE']) { const v = single(q, name); if (v) filter[name] = v; }
      const rows = await table.list(filter['ZDEAL_ID'] ? { column: 'ZDEAL_ID', value: filter['ZDEAL_ID'] } : undefined);
      return rows.filter(r => Object.entries(filter).every(([k, v]) => r[k] === v));
    },
    inRow(body) {
      const out = { ...body };
      for (const c of DEALDMS_DATES) if (c in out) out[c] = toSapDate(out[c], c);
      for (const c of DEALDMS_TIMES) if (c in out) out[c] = toSapTime(out[c], c);
      return out;
    },
    outRow(row) {
      const out: Row = { ...row };
      for (const c of DEALDMS_DATES) { const v = String(row[c] ?? ''); out[c] = /^\d{8}$/.test(v) && v !== '00000000' ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null; }
      for (const c of DEALDMS_TIMES) { const v = String(row[c] ?? ''); out[c] = /^\d{6}$/.test(v) ? `${v.slice(0, 2)}:${v.slice(2, 4)}:${v.slice(4, 6)}` : null; }
      return out;
    }
  },
  {
    // TSF_FX_POST_DOC: the FI documents of an FX deal leg's posting, in the BackEnd's own database. Read and written, never deleted.
    name: 'tsf-fx-post-doc', parts: 2, ops: { get: true, put: true }, notFound: 'No FI documents are stored for this company code and transaction.',
    table: () => sqlTable(refDriver, FX_POST_DOC_TABLE, FX_POST_DOC_COLUMNS),
    key: p => ({ ZBUKRS: required(p[0], 'fxCompanyCode'), ZRFHA: required(p[1], 'fxTransaction') })
  },
  {
    // ZSGTSFTR_LIM_MAN: FX limits, keyed by year + currency pair + validity start + end (YYYYMMDD). Listed and saved, not read singly or deleted.
    name: 'tsf-limit', parts: 4, ops: { put: true },
    table: deps => cloudTable(deps, 'limMan', LIM_MAN_COLUMNS),
    key(p) {
      const date = (v: string, name: string) => { if (!/^[0-9]{8}$/.test(v)) throw new BadRequest(`${name} must be a date as YYYYMMDD.`); return v; };
      const year = String(p[0] ?? '');
      if (!/^[0-9]{4}$/.test(year)) throw new BadRequest('year must be 4 digits.');
      const pair = String(p[1] ?? '').trim();
      if (!pair || pair.length > 7) throw new BadRequest('pair is required, at most 7 characters.');
      const start = date(String(p[2] ?? ''), 'start');
      const end = date(String(p[3] ?? ''), 'end');
      if (end < start) throw new BadRequest('end cannot be before start.');
      return { ZYEAR: year, ZCURR_PAIR: pair, ZLIMIT_STARTDT: start, ZLIMIT_MATDT: end };
    },
    list(table, q) {
      const filter = ['ZYEAR', 'ZCURR_PAIR'].map(name => [name, single(q, name)] as const).find(([, v]) => v !== undefined);
      return table.list(filter ? { column: filter[0], value: filter[1]! } : undefined);
    }
  },
  { name: 'tsf-currency-pair', parts: 0, ops: {}, table: deps => cloudTable(deps, 'curpair', CURPAIR_COLUMNS), list: whole },
  { name: 'tsf-field-name', parts: 0, ops: {}, table: deps => cloudTable(deps, 'fields', FIELDS_COLUMNS), list: whole },
  {
    // ZSGTSFTR_DMS_TYP: DMS document types per category.
    name: 'tsf-dms-type', parts: 2, ops: { get: true, put: true, delete: true }, notFound: 'No DMS document type with this category and type.',
    table: deps => cloudTable(deps, 'dmsType', DMS_TYP_COLUMNS, 'upper'),
    key: p => ({ ZDMS_CAT: required(p[0], 'dmsCategory'), ZDMS_TYPE: required(p[1], 'dmsType') }),
    list: filtered('ZDMS_CAT')
  },
  {
    // ZSGTSFTR_DAYLOCK: one row per blotter date (YYYYMMDD) + group + trader once that day's FX Deal Blotter is locked.
    // ZB_TYPE, ZCO_AREA, ZYEAR and ZMONTH are the program's own constants or derived from the date. Locking is the only write.
    name: 'tsf-day-lock', parts: 3, ops: { get: true, put: true, delete: true }, notFound: 'This blotter day is not locked.',
    table: deps => cloudTable(deps, 'daylock', DAYLOCK_COLUMNS, 'upper'),
    key(p) {
      const date = String(p[0] ?? '');
      const y = Number(date.slice(0, 4)), m = Number(date.slice(4, 6)), d = Number(date.slice(6, 8));
      const real = /^[0-9]{8}$/.test(date) && new Date(y, m - 1, d).getMonth() === m - 1 && new Date(y, m - 1, d).getDate() === d;
      if (!real) throw new BadRequest('date must be a real date as YYYYMMDD.');
      const group = String(p[1] ?? '').trim();
      const trader = String(p[2] ?? '').trim();
      if (!group || group.length > 3) throw new BadRequest('group is required, at most 3 characters.');
      if (!trader || trader.length > 10) throw new BadRequest('trader is required, at most 10 characters.');
      return { ZB_TYPE: DAYLOCK_BLOTTER, ZCO_AREA: DAYLOCK_CO_AREA, ZGRP: group, ZMONTH: String(m), ZPDATE: date, ZTYPE: trader, ZYEAR: date.slice(0, 4) };
    },
    list: filtered('ZTYPE'),
    async find(table, key) {
      const row = await table.get(key);
      if (row || key['ZMONTH'].length === 2) return row;
      // Cloud rows use months 1..9; older local copies kept 01..09.
      const old = await table.get({ ...key, ZMONTH: key['ZMONTH'].padStart(2, '0') });
      if (old) key['ZMONTH'] = String(old['ZMONTH']);
      return old;
    },
    putFields: () => Promise.resolve({ ZLOCKED: 'X' })
  }
];

/** Anything the table layer throws, as the status the caller should see; unexpected failures are logged, never shown. */
function failure(error: unknown): Response {
  if (error instanceof TableError) return refError(error.status, error.message);
  if (error instanceof BadRequest || error instanceof DdicInputError) return refError(400, error.message);
  console.error(error);
  if (error instanceof Error && /no such table|doesn't exist/i.test(error.message)) return refError(503, 'The local database is not initialised: the BackEnd applies DB/schema when it starts.');
  return refError(500, 'The local database request failed.');
}

/** Answers /api/ref/localdb/… (the write guard has already run). */
export async function routeLocalDb(req: Request, deps: RefDeps): Promise<Response> {
  const url = new URL(req.url);
  const rest = url.pathname.slice(LOCALDB_PREFIX.length).split('/').filter(Boolean);
  const unknown = () => refError(404, `No local database route for ${url.pathname}.`);
  const resource = RESOURCES.find(r => r.name === rest[0]);
  if (!resource) return unknown();
  try {
    const parts = rest.slice(1).map(p => { try { return decodeURIComponent(p); } catch { throw new BadRequest('The path is not valid.'); } });
    const table = resource.table(deps);
    const shape = resource.outRow ?? ((row: DdicRow): Row => row);
    const method = req.method;
    if (parts.length === 0) {
      if (method !== 'GET' || !resource.list) return unknown();
      return send(200, { value: (await resource.list(table, url.searchParams)).map(shape) });
    }
    if (parts.length !== resource.parts || !resource.key) return unknown();
    const op = method === 'GET' ? 'get' : method === 'PUT' ? 'put' : method === 'DELETE' ? 'delete' : undefined;
    if (!op || !resource.ops[op]) return unknown();
    const key = resource.key(parts);
    const find = (): Promise<DdicRow | undefined> => (resource.find ? resource.find(table, key) : table.get(key));
    const missing = () => refError(404, resource.notFound ?? 'Not found.');
    if (op === 'get') { const row = await find(); return row ? send(200, shape(row)) : missing(); }
    if (op === 'delete') {
      const existing = await find();
      if (!existing) return missing();
      return (await table.remove(key)) ? send(204) : missing();
    }
    // PUT: create the row, or update just the fields sent.
    const body = resource.putFields ? await resource.putFields(req) : await jsonObject(req);
    for (const stamp of STAMP_FIELDS) delete body[stamp];
    const fields = resource.inRow ? resource.inRow(body) : body;
    const user = actingUserOf(req.headers.get(USER_HEADER)).slice(0, 12);
    const { date, time } = sapStamp();
    const existing = await find();
    const stamps = {
      ...(existing ? {} : { ZCREATED_BY: user, ZCREATED_DATE: date, ZCREATED_TIME: time }),
      ZCHANGED_BY: user, ZCHANGED_DATE: date, ZCHANGED_TIME: time
    };
    const saved = await table.upsert(key, { ...fields, ...stamps }, existing);
    return send(existing ? 200 : 201, shape(saved));
  } catch (error) {
    return failure(error);
  }
}
