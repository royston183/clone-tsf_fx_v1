// A large list's query on a data table, in SQL: the same rows, order and total as `applyQuery` on the stored rows
// (spec 2026-10-27-app-data-tables §6). Values always travel as parameters; text compares exactly on both engines.
import { typeOf, type AnyField } from '@/lib/fields';
import type { Row } from '@/lib/grid/types';
import { sortColumnsOf, type AnyList, type ListFilter, type ListPage, type ListQuery } from '@/lib/list/types';
import { applyQuery, orderOf } from '@core/server/list-query';
import type { ColumnSpec, TableSpec } from '../schema/wanted';
import type { Driver, SqlValue } from './driver';

type Engine = Driver['engine'];
const NUMERIC_TYPES = new Set(['integer', 'amount', 'decimal']);

const columnOf = (table: TableSpec, name: string) => table.columns.find(c => c.name === name);
const fieldOf = (list: AnyList, field: string): AnyField | undefined => list.fields.find(d => d.field === field);
const isEtag = (table: TableSpec, c: ColumnSpec) => table.etag && c.name === 'etag';
const stripZeros = (digits: string): string => digits.replace(/^0+(?=\d)/, '');
const padNumc = (d: AnyField, digits: string): string => (d.max ? stripZeros(digits).padStart(d.max, '0') : stripZeros(digits));

/** How `applyQuery` compares a field: as a number, as a zero-padded NUMC string, or as text. */
function kindOf(list: AnyList, numbers: ReadonlySet<string>, field: string): 'number' | 'padded' | 'text' {
  const d = fieldOf(list, field);
  if (!d) return 'text';
  const t = typeOf(d);
  if (t === 'amount' || t === 'decimal' || (t === 'integer' && (numbers.has(field) || !d.max))) return 'number';
  return t === 'integer' ? 'padded' : 'text';
}

/** A decimal with exactly `scale` places; a string from the engine never goes through Number. */
function decimalText(v: unknown, scale: number): string {
  if (typeof v === 'number') return v.toFixed(scale);
  const m = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(String(v));
  if (!m) return String(v);
  return `${m[1] === '-' ? '-' : ''}${m[2] || '0'}${scale ? `.${(m[3] ?? '').padEnd(scale, '0').slice(0, scale)}` : ''}`;
}

/** A table row as a `Row`: NULL is '', decimals have their scale, numbers (bigint too) are digits, the header's etag is `__etag` (left out when NULL). */
export function toRow(table: TableSpec, record: Record<string, unknown>): Row {
  const row: Row = {};
  for (const c of table.columns) {
    const v = record[c.name];
    if (isEtag(table, c)) { if (v != null) row.__etag = String(v); continue; }
    row[c.name] = v == null ? '' : c.kind === 'decimal' ? decimalText(v, c.scale ?? 2) : typeof v === 'bigint' ? v.toString() : String(v);
  }
  return row;
}

/** A `Row` as column values: '' is NULL for integer, decimal and date columns; `__etag` goes into etag. */
export function toParams(table: TableSpec, row: Row): Record<string, SqlValue> {
  const out: Record<string, SqlValue> = {};
  for (const c of table.columns) {
    if (isEtag(table, c)) { out[c.name] = row.__etag || null; continue; }
    const v = row[c.name] ?? '';
    out[c.name] = v === '' && c.kind !== 'string' ? null : v;
  }
  return out;
}

export const quoteId = (engine: Engine, name: string): string =>
  (engine === 'mysql' ? `\`${name.replace(/`/g, '``')}\`` : `"${name.replace(/"/g, '""')}"`);

/**
 * The column compared byte for byte (case-sensitive), whatever its collation. MySQL: CAST(… AS BINARY), since the BINARY
 * operator is deprecated from 8.0.27; COLLATE utf8mb4_bin would not do, as it ignores trailing spaces (PAD SPACE).
 */
export const exact = (engine: Engine, column: string): string =>
  (engine === 'mysql' ? `CAST(${quoteId(engine, column)} AS BINARY)` : `${quoteId(engine, column)} COLLATE BINARY`);

/**
 * Search ignores case: the value lower-cased, then compared byte for byte. SQLite's LOWER() folds A–Z only, as applyQuery's
 * caseless search does; MySQL's folds accented capitals too (É finds é there, not on SQLite). Accents always count.
 */
const lowered = (engine: Engine, value: string): string => (engine === 'mysql' ? `CAST(LOWER(${value}) AS BINARY)` : `LOWER(${value})`);

/** Whether SQL on this column orders like `applyQuery` on the field: text as text, NUMC as its padded text, numbers as numbers. */
function sameOrder(c: ColumnSpec, d: AnyField | undefined): boolean {
  const t = d ? typeOf(d) : '';
  // A NUMC integer is stored zero-padded only when it has a length; padded digits order as numbers do.
  if (c.kind === 'string') return !NUMERIC_TYPES.has(t) || (t === 'integer' && Boolean(d?.max && d.keepZeros));
  if (c.kind === 'date') return !NUMERIC_TYPES.has(t);
  return NUMERIC_TYPES.has(t);
}

/** False when SQL could give other rows or another order than `applyQuery`; the list is then queried in memory. */
export function canQueryInSql(table: TableSpec, list: AnyList): boolean {
  if ((list.search ?? []).some(f => columnOf(table, f)?.kind !== 'string')) return false;
  const used = [...(list.search ?? []), ...(list.filters ?? []), ...sortColumnsOf(list), ...list.keys];
  return used.every(f => {
    const c = columnOf(table, f);
    return Boolean(c) && !isEtag(table, c as ColumnSpec) && sameOrder(c as ColumnSpec, fieldOf(list, f));
  });
}

/** The page's SELECT and the matching COUNT(*), following `applyQuery`'s filter, order and page. */
export function listSql(engine: Engine, table: TableSpec, list: AnyList, q: ListQuery, numeric: Set<string>): { sql: string; params: SqlValue[]; countSql: string; countParams: SqlValue[] } {
  const id = (name: string) => quoteId(engine, name);
  const colOf = (name: string): ColumnSpec => {
    const c = columnOf(table, name);
    if (!c) throw new Error(`${table.name} has no column "${name}".`);
    return c;
  };
  const expr = (c: ColumnSpec) => (c.kind === 'string' ? exact(engine, c.name) : id(c.name));
  // applyQuery reads NULL as '', which sorts before every other value; a nullable text column holds both.
  const sortExpr = (c: ColumnSpec) => (c.kind !== 'string' || c.notNull ? expr(c)
    : engine === 'mysql' ? `CAST(COALESCE(${id(c.name)}, '') AS BINARY)` : `COALESCE(${id(c.name)}, '') COLLATE BINARY`);
  const params: SqlValue[] = [];
  const where: string[] = [];

  if (q.search) {
    const parts = (list.search ?? []).map(f => { params.push(q.search as string); return `INSTR(${lowered(engine, id(f))}, ${lowered(engine, '?')}) > 0`; });
    where.push(parts.length ? `(${parts.join(' OR ')})` : '1 = 0');
  }

  const filterSql = (f: ListFilter): string | undefined => {
    const c = colOf(f.field), e = expr(c);
    const d = fieldOf(list, f.field);
    // A NUMC value compares as its zero-padded digits, as applyQuery pads it.
    const value = (v: string) => (v !== '' && c.kind === 'string' && d && kindOf(list, numeric, f.field) !== 'text' ? padNumc(d, v) : v);
    let core: string;
    // Whether a missing value ('' or NULL) passes, by applyQuery's rule: '' equals only '' and is below everything else.
    let empty: boolean;
    if (f.op === 'contains') {
      if (!f.values[0]) return undefined;
      params.push(f.values[0]);
      core = `INSTR(${e}, ?) > 0`;
      empty = false;
    } else if (f.op === 'between') {
      const [from, to] = f.values.map(value);
      const range: string[] = [];
      if (from) { params.push(from); range.push(`${e} >= ?`); }
      if (to) { params.push(to); range.push(`${e} <= ?`); }
      core = range.join(' AND ') || '1 = 1';
      empty = !from;
    } else {
      // Only a text column holds ''; elsewhere '' is NULL.
      const values = f.values.map(value).filter(v => v !== '' || c.kind === 'string');
      params.push(...values);
      core = values.length ? `${e} IN (${values.map(() => '?').join(', ')})` : '1 = 0';
      empty = f.values.includes('');
    }
    return empty && !c.notNull ? `(${core} OR ${id(c.name)} IS NULL)` : core;
  };
  for (const f of q.filters ?? []) { const s = filterSql(f); if (s) where.push(s); }

  // orderOf's keys make the order total; the primary key after them keeps paging stable if the list's keys differ.
  const sorts = orderOf(list, q);
  const order = sorts.map(s => `${sortExpr(colOf(s.field))}${s.dir === -1 ? ' DESC' : ''}`);
  for (const k of table.primaryKey) if (!sorts.some(s => s.field === k)) order.push(sortExpr(colOf(k)));

  const offset = (q.page - 1) * q.pageSize;
  // mysql2 prepared statements refuse numeric LIMIT arguments on MySQL 8.0.22+; strings work.
  const paging: SqlValue[] = engine === 'mysql' ? [String(q.pageSize), String(offset)] : [q.pageSize, offset];
  const from = `FROM ${id(table.name)}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  return {
    sql: `SELECT * ${from} ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`,
    params: [...params, ...paging],
    countSql: `SELECT COUNT(*) AS n ${from}`,
    countParams: [...params]
  };
}

/** One page of the list, in SQL when `canQueryInSql`, otherwise `applyQuery` on every row; page and total read together. */
export async function queryTable(driver: Driver, table: TableSpec, list: AnyList, q: ListQuery, numeric: Set<string>): Promise<ListPage> {
  return driver.transaction(async tx => {
    if (!canQueryInSql(table, list)) {
      const byKey = table.primaryKey.map(k => (columnOf(table, k)?.kind === 'string' ? exact(tx.engine, k) : quoteId(tx.engine, k))).join(', ');
      const rows = (await tx.all(`SELECT * FROM ${quoteId(tx.engine, table.name)} ORDER BY ${byKey}`)).map(r => toRow(table, r));
      return applyQuery(rows, q, list, numeric, { caseless: true });
    }
    const { sql, params, countSql, countParams } = listSql(tx.engine, table, list, q, numeric);
    const rows = await tx.all(sql, params);
    const count = await tx.all(countSql, countParams);
    return { rows: rows.map(r => toRow(table, r)), total: Number(count[0]?.n ?? 0), page: q.page, pageSize: q.pageSize };
  });
}
