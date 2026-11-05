// A module's own data in real tables: the Backend that replaces localBackend's JSON document, with the same results
// (spec 2026-10-27-app-data-tables §5–6). The ETag check stays in object-service; this only writes new ETags.
import { keyOf, str } from '@/lib/grid/grid';
import type { Row, StampFields } from '@/lib/grid/types';
import { HttpError } from '@/lib/errors';
import { applyLocal, type PlanOp } from '@/lib/planner';
import { labelOf, valueFields } from '@/lib/fields';
import { isTableModule } from '@/modules/registry';
import type { ModuleData } from '@/modules/server-registry';
import { contractOf, moduleTables, seedOf } from '@/modules/tables';
import type { ModuleSeed } from '@/modules/types';
import type { Backend, ObjectSpec, StoredObject } from '@core/server/backend';
import { applyQuery } from '@core/server/list-query';
import { nextNumber } from '@core/server/local-store';
import { textLength, type ColumnSpec, type TableSpec } from '../schema/wanted';
import type { Driver, SqlValue } from './driver';
import { exact, queryTable, quoteId, toParams, toRow } from './list-sql';

const SEED_ETAG = 'W/"local-seed"';
const APP_MODULES = 'app_modules';
const KEYS_PER_STATEMENT = 100;
const PARAMS_PER_INSERT = 5000;

const codeOf = (e: unknown): unknown => (e as { code?: unknown } | null)?.code;
const isMissingTable = (e: unknown): boolean => (e instanceof Error && /no such table/i.test(e.message)) || codeOf(e) === 'ER_NO_SUCH_TABLE';
const isMissingColumn = (e: unknown): boolean =>
  (e instanceof Error && /no such column|has no column named/i.test(e.message)) || codeOf(e) === 'ER_BAD_FIELD_ERROR';
const DUPLICATE_CODES = new Set(['ER_DUP_ENTRY', 'SQLITE_CONSTRAINT_PRIMARYKEY', 'SQLITE_CONSTRAINT_UNIQUE']);
const isDuplicate = (e: unknown): boolean =>
  (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) || DUPLICATE_CODES.has(String(codeOf(e)));

/** Runs one statement on `table`; a missing table or column becomes a 500 that says how to bring the table up to date. */
async function on<T>(table: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingTable(error)) throw new HttpError(500, `The table ${table} does not exist yet: FS Sprint creates it after the agent's turn (or run npm run gen-schema).`);
    if (isMissingColumn(error)) throw new HttpError(500, `The table ${table} does not match the module definition yet: FS Sprint updates it after the agent's turn (or run npm run gen-schema).`);
    throw error;
  }
}

/** The caption of a table's column in messages: its field's label, else the column name. */
type LabelOf = (t: TableSpec, column: string) => string;
const MAX_BIGINT = 9223372036854775807n;
const MIN_BIGINT = -9223372036854775808n;
const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** '' when the value fits the column on both engines, else what is wrong (MySQL would refuse it, SQLite keep it). */
function misfit(c: ColumnSpec, value: SqlValue): string {
  if (value == null || value === '') return '';
  const v = String(value);
  const chars = textLength(c.type);
  if (chars) return [...v].length > chars ? `at most ${plural(chars, 'character')}.` : '';
  if (c.type === 'BIGINT') return /^[-+]?\d+$/.test(v) && (BigInt(v) > MAX_BIGINT || BigInt(v) < MIN_BIGINT) ? 'the number is too large.' : '';
  const dec = /^DECIMAL\((\d+),(\d+)\)$/.exec(c.type);
  const parts = dec && /^[-+]?(\d*)(?:\.(\d*))?$/.exec(v.trim());
  if (!dec || !parts) return '';
  const precision = Number(dec[1]), scale = Number(dec[2]);
  if (parts[1].replace(/^0+/, '').length > precision - scale) return `at most ${plural(precision - scale, 'digit')} before the decimal point.`;
  if ((parts[2] ?? '').replace(/0+$/, '').length > scale) return `at most ${plural(scale, 'decimal')}.`;
  return '';
}

const chunks = <T>(xs: T[], size: number): T[][] => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));
const sameObject = (keys: string[], r: Row, key: Row) => keys.every(k => r[k] === key[k]);
const columnsOf = (t: TableSpec, row: Row): SqlValue[] => { const p = toParams(t, row); return t.columns.map(c => p[c.name]); };
/** The row's column values to write; a value its column cannot hold is a 400 that names the field. */
function fitted(t: TableSpec, row: Row, label: LabelOf): SqlValue[] {
  const values = columnsOf(t, row);
  t.columns.forEach((c, i) => {
    const problem = misfit(c, values[i]);
    if (problem) throw new HttpError(400, `${label(t, c.name)}: ${problem}`);
  });
  return values;
}
/** The key as the table compares it: case-insensitive on a NOCASE column, exact otherwise. */
const storedKey = (t: TableSpec, r: Row): string =>
  t.primaryKey.map(k => { const v = str(r[k]); return t.columns.find(c => c.name === k)?.nocase ? v.toLowerCase() : v; }).join('~');
const alreadyExists = (t: TableSpec, r: Row) => new HttpError(409, `${t.primaryKey.map(k => str(r[k])).join(' / ')} already exists.`);

/** The primary key order: text byte for byte, as JavaScript compares it. */
const orderBy = (tx: Driver, t: TableSpec): string =>
  t.primaryKey.map(k => (t.columns.find(c => c.name === k)?.kind === 'string' ? exact(tx.engine, k) : quoteId(tx.engine, k))).join(', ');

/** Every row of `t` whose `cols` match one of `keys` (by the column's collation; callers compare exactly), in key order. */
async function rowsWhere(tx: Driver, t: TableSpec, cols: string[], keys: Row[]): Promise<Row[]> {
  if (!keys.length) return [];
  const id = (c: string) => quoteId(tx.engine, c);
  const where = cols.length === 1 ? `${id(cols[0])} IN (${keys.map(() => '?').join(', ')})`
    : keys.map(() => `(${cols.map(c => `${id(c)} = ?`).join(' AND ')})`).join(' OR ');
  const params = keys.flatMap(k => cols.map(c => str(k[c])));
  const rows = await on(t.name, () => tx.all(`SELECT * FROM ${id(t.name)} WHERE ${where} ORDER BY ${orderBy(tx, t)}`, params));
  return rows.map(r => toRow(t, r));
}

/** Inserts in multi-row statements; with `refuseTaken`, a stored key becomes a 409 that names it. */
async function insertRows(tx: Driver, t: TableSpec, rows: Row[], label: LabelOf, refuseTaken = false): Promise<void> {
  const cols = t.columns.map(c => quoteId(tx.engine, c.name)).join(', ');
  const one = `(${t.columns.map(() => '?').join(', ')})`;
  for (const part of chunks(rows, Math.max(1, Math.floor(PARAMS_PER_INSERT / t.columns.length)))) {
    try {
      await on(t.name, () => tx.run(`INSERT INTO ${quoteId(tx.engine, t.name)} (${cols}) VALUES ${part.map(() => one).join(', ')}`, part.flatMap(r => fitted(t, r, label))));
    } catch (error) {
      if (!refuseTaken || !isDuplicate(error)) throw error;
      // The failed statement inserted nothing, so the rows found are the ones stored before it.
      const taken = new Set((await rowsWhere(tx, t, t.primaryKey, part)).map(r => storedKey(t, r)));
      throw alreadyExists(t, part.find(r => taken.has(storedKey(t, r))) ?? part[0]);
    }
  }
}

/** The WHERE clause and values that find exactly the stored row `r`. */
function byKey(tx: Driver, t: TableSpec, r: Row): { where: string; params: SqlValue[] } {
  const p = toParams(t, r);
  return { where: t.primaryKey.map(k => `${quoteId(tx.engine, k)} = ?`).join(' AND '), params: t.primaryKey.map(k => p[k]) };
}

/** Rewrites the stored row `before` as `after`; moving it onto a stored key is a 409. */
async function updateRow(tx: Driver, t: TableSpec, before: Row, after: Row, label: LabelOf): Promise<void> {
  const { where, params } = byKey(tx, t, before);
  const set = t.columns.map(c => `${quoteId(tx.engine, c.name)} = ?`).join(', ');
  const values = fitted(t, after, label);
  try {
    await on(t.name, () => tx.run(`UPDATE ${quoteId(tx.engine, t.name)} SET ${set} WHERE ${where}`, [...values, ...params]));
  } catch (error) {
    throw isDuplicate(error) ? alreadyExists(t, after) : error;
  }
}

async function deleteRow(tx: Driver, t: TableSpec, r: Row): Promise<void> {
  const { where, params } = byKey(tx, t, r);
  await on(t.name, () => tx.run(`DELETE FROM ${quoteId(tx.engine, t.name)} WHERE ${where}`, params));
}

/** The operations on the rows they touch, stamped and merged by `applyLocal`, written as deletes, updates and inserts. */
async function applyOps(tx: Driver, t: TableSpec, keys: string[], stamps: StampFields | undefined, ops: PlanOp[], user: string, label: LabelOf): Promise<void> {
  if (!ops.length) return;
  const tab = { keys };
  const before = await rowsWhere(tx, t, keys, ops.map(o => o.key));
  const after = applyLocal(tab, stamps, before, ops, user);
  // applyLocal appends a create even when its key is stored (or stored in another case): refuse it, never overwrite.
  const seen = new Set<string>();
  for (const r of after) {
    const k = storedKey(t, r);
    if (seen.has(k)) throw alreadyExists(t, r);
    seen.add(k);
  }
  const was = new Map(before.map(r => [keyOf(tab, r), r]));
  const now = new Map(after.map(r => [keyOf(tab, r), r]));
  for (const [k, r] of was) if (!now.has(k)) await deleteRow(tx, t, r);
  const inserts: Row[] = [];
  for (const [k, r] of now) {
    const old = was.get(k);
    if (!old) inserts.push(r);
    else if (JSON.stringify(columnsOf(t, old)) !== JSON.stringify(columnsOf(t, r))) await updateRow(tx, t, old, r, label);
  }
  await insertRows(tx, t, inserts, label, true);
}

/**
 * A module's tables on a database, seeded once from its sample data; the same behaviour as `localBackend`, except that
 * rows come back in primary-key order (localBackend keeps insertion order).
 */
export function tableBackend(id: string, entry: ModuleData, driver: Driver, tables: TableSpec[]): Backend {
  const infos = moduleTables(entry.def);
  const byEntity = new Map(tables.map(t => [t.entity, t]));
  const stamps = isTableModule(entry.def) ? entry.def.stamps : undefined;
  const numeric = new Set(contractOf(entry).numbers ?? []);
  let seedCache: ModuleSeed | undefined;
  const sample = seedOf(entry);
  const seedData = () => (seedCache ??= typeof sample === 'function' ? sample() : sample);
  // A column's label from its own table's fields, else from another table's (an item table's header key).
  const labels = new Map(Object.entries(infos).map(([entity, info]) => [entity, new Map(valueFields(info.defs).map(d => [d.field, labelOf(d)]))]));
  const label: LabelOf = (t, column) =>
    labels.get(t.entity)?.get(column) ?? [...labels.values()].find(m => m.has(column))?.get(column) ?? column;
  const need = (entity: string): TableSpec => {
    const t = byEntity.get(entity);
    if (!t) throw new HttpError(404, 'Unknown table.');
    return t;
  };

  let lookupsCache: Record<string, Row[]> | undefined;
  const lookups = () => structuredClone(lookupsCache ??= seedData().lookups ?? {});

  /** Seed rows (as `seed` holds them) and the app_modules row in one transaction, unless app_modules has the module. */
  async function seed(): Promise<void> {
    await driver.transaction(async tx => {
      const table = quoteId(tx.engine, APP_MODULES);
      if ((await on(APP_MODULES, () => tx.all(`SELECT module_id FROM ${table} WHERE module_id = ?`, [id]))).length) return;
      // The app_modules row first: on MySQL a racing transaction waits on it, then finds it taken and seeds nothing.
      try {
        await on(APP_MODULES, () => tx.run(`INSERT INTO ${table} (module_id, seeded_at) VALUES (?, ?)`, [id, new Date().toISOString()]));
      } catch (error) {
        if (isDuplicate(error)) return;
        throw error;
      }
      for (const [entity, rows] of Object.entries(seedData().tables)) {
        const t = byEntity.get(entity);
        if (t) await insertRows(tx, t, rows, label);
      }
    });
  }
  let seeding: Promise<void> | undefined;
  // Once per backend; a failed seed (a missing table) is tried again on the next call.
  const seeded = () => (seeding ??= seed().catch(error => { seeding = undefined; throw error; }));

  let version = 0;
  const newEtag = () => `W/"local-${Date.now()}-${++version}"`;

  async function readObject(spec: ObjectSpec, key: Row): Promise<StoredObject | null> {
    await seeded();
    const header = need(spec.table);
    return driver.transaction(async tx => {
      const found = (await rowsWhere(tx, header, spec.keys, [key])).find(r => sameObject(spec.keys, r, key));
      if (!found) return null;
      const items: Record<string, Row[]> = {};
      for (const i of spec.items) items[i.tab] = (await rowsWhere(tx, need(i.table), spec.keys, [key])).filter(r => sameObject(spec.keys, r, key));
      // A seeded row has no ETag yet: give it a fixed one, so the first concurrent save is detected too.
      return { header: { ...found, __etag: found.__etag ?? SEED_ETAG }, items };
    });
  }

  return {
    mode: 'local',
    async load() {
      await seeded();
      const out: Record<string, Row[]> = {};
      await driver.transaction(async tx => {
        for (const t of tables) {
          if (infos[t.entity]?.large) continue;
          const rows = await on(t.name, () => tx.all(`SELECT * FROM ${quoteId(tx.engine, t.name)} ORDER BY ${orderBy(tx, t)}`));
          out[t.entity] = rows.map(r => toRow(t, r));
        }
      });
      return { tables: out, lookups: lookups() };
    },
    lookups: async () => lookups(),
    async query(_actor, table, list, q) {
      await seeded();
      const t = byEntity.get(table);
      if (!t) return applyQuery([], q, list, numeric, { caseless: true });
      return on(t.name, () => queryTable(driver, t, list, q, numeric));
    },
    async readKeys(_actor, table, keys) {
      const info = infos[table];
      const t = byEntity.get(table);
      if (!info || !t) return [];
      await seeded();
      const wanted = new Set(keys.map(k => keyOf(info, k)));
      const seen = new Set<string>();
      return driver.transaction(async tx => {
        const out: Row[] = [];
        for (const part of chunks(keys, KEYS_PER_STATEMENT)) {
          for (const r of await rowsWhere(tx, t, info.keys, part)) {
            const k = keyOf(info, r);
            if (wanted.has(k) && !seen.has(k)) { seen.add(k); out.push(r); }
          }
        }
        return out;
      });
    },
    readObject: (_actor, spec, key) => readObject(spec, key),
    async writeObject(actor, spec, w) {
      await seeded();
      const header = need(spec.table);
      return driver.transaction(async tx => {
        let key: Row = Object.fromEntries(spec.keys.map(k => [k, w.key[k] ?? '']));
        if (w.op === 'create' && spec.keys.some(k => !key[k])) {
          const first = spec.keys[0];
          const numbers = await on(header.name, () => tx.all(`SELECT ${quoteId(tx.engine, first)} FROM ${quoteId(tx.engine, header.name)}`));
          key = { ...key, [first]: nextNumber(numbers.map(r => ({ [first]: str(r[first]) })), first) };
        }
        const headerOps: PlanOp[] = w.op === 'create' ? [{ op: 'create', id: '', key, data: { ...w.header, ...key, __etag: newEtag() } }]
          : w.op === 'delete' ? [{ op: 'delete', id: '', key }]
          : [{ op: 'update', id: '', key, data: { ...w.header, __etag: newEtag() } }];
        await applyOps(tx, header, spec.keys, undefined, headerOps, actor.username, label);
        for (const i of spec.items) {
          const t = need(i.table);
          if (w.op === 'delete') {
            for (const r of (await rowsWhere(tx, t, spec.keys, [key])).filter(r => sameObject(spec.keys, r, key))) await deleteRow(tx, t, r);
            continue;
          }
          const ops: PlanOp[] = w.items.filter(c => c.tab === i.tab).map(c => ({ op: c.op, id: '', key: { ...key, ...c.key }, data: { ...c.data, ...key, ...c.key } }));
          await applyOps(tx, t, i.keys, undefined, ops, actor.username, label);
        }
        return key;
      });
    },
    async action(_actor, spec, key, _etag, _name, mock) {
      if (!mock) return;
      await seeded();
      const t = need(spec.table);
      await driver.transaction(async tx => {
        for (const r of (await rowsWhere(tx, t, spec.keys, [key])).filter(r => sameObject(spec.keys, r, key))) await updateRow(tx, t, r, { ...mock(r), __etag: newEtag() }, label);
      });
    },
    async apply(actor, table, ops) {
      const info = infos[table];
      const t = byEntity.get(table);
      if (!info || !t) throw new HttpError(404, 'Unknown table.');
      await seeded();
      await driver.transaction(tx => applyOps(tx, t, info.keys, stamps, ops, actor.username, label));
    }
  };
}
