// The table backend behaves as localBackend does, over real SQLite tables (spec 2026-10-27-app-data-tables §5–6).
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@core/actor';
import type { Backend } from '@core/server/backend';
import { memoryStateStore, moduleLocalBackend } from '@core/server/local-store';
import { objectSpec } from '@core/server/object-service';
import type { AnyField } from '@/lib/fields';
import type { Row, StampFields } from '@/lib/grid/types';
import type { AnyObjectDef, AnyModuleDef, ModuleSeed } from '@/modules/types';
import { applyLocal, type PlanOp } from '@/lib/planner';
import { SERVER_MODULES, type ModuleData } from '@/modules/server-registry';
import { contractOf } from '@/modules/tables';
import { sqliteDriver } from '../../src/db';
import { createIndexSql, createTableSql } from '../../src/schema/ddl';
import { moduleSchema, type TableSpec } from '../../src/schema/wanted';
import type { Driver } from '../../src/tables/driver';
import { tableBackend } from '../../src/tables/table-backend';

const APP_MODULES = 'CREATE TABLE app_modules (module_id VARCHAR(100) NOT NULL PRIMARY KEY, seeded_at VARCHAR(30) NOT NULL)';
const actor: Actor = { id: 'u1', username: 'tester', sap: null };
const DEALS = 'sample-deals';
const dealsEntry = SERVER_MODULES[DEALS];
const dealsDef = dealsEntry.def as AnyObjectDef;
const spec = objectSpec(dealsDef, contractOf(dealsEntry));
const dealsTables = moduleSchema(DEALS, dealsEntry);

/** An in-memory database with app_modules and the given tables. */
function database(tables: TableSpec[]): { db: DatabaseSync; driver: Driver } {
  const db = new DatabaseSync(':memory:');
  db.exec(APP_MODULES);
  for (const t of tables) {
    db.exec(createTableSql(t));
    for (const ix of t.indexes) db.exec(createIndexSql(t.name, ix));
  }
  return { db, driver: sqliteDriver(db) };
}
const count = (db: DatabaseSync, table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;

const ID: AnyField = { field: 'id', label: 'Id', type: 'code', max: 4, key: true };
const STAMPS: StampFields = ['cby', 'con', 'cat', 'mby', 'mon', 'mat'];
/** A one-table module with stamps on the application's own data. */
function stampedModule(seedRows: Row[] = []): ModuleData {
  const grid: AnyField[] = [ID, { field: 'qty', label: 'Qty', type: 'integer' }, { field: 'note', label: 'Note', type: 'text', max: 40 }];
  const def = {
    id: 'stamped', title: 'Stamped', noun: 'rows', serviceKey: 'x', storageKey: 'stamped', blankRows: 1, strict: false, lookups: () => ({}),
    tabs: [{ id: 'rows', label: 'Rows', keys: ['id'], grid, columns: [] }], fields: { rows: [...grid.map(g => g.field), ...STAMPS] }, stamps: STAMPS
  } as unknown as AnyModuleDef;
  return { def, contract: { numbers: ['qty'] } as unknown as ModuleData['contract'], seed: { tables: { rows: seedRows }, lookups: { units: [{ CODE: 'EA' }] } }, source: 'app' };
}

let clock = 0;
/** Moves the fake clock one minute on, so every write gets another time. */
const tick = () => vi.setSystemTime(new Date(Date.UTC(2026, 9, 27, 10, 0, 0) + ++clock * 60_000));

beforeEach(() => { clock = 0; vi.useFakeTimers({ toFake: ['Date'] }); tick(); });
afterEach(() => { vi.useRealTimers(); });

/** One scenario on a Deals backend; every result in order. */
async function scenario(b: Backend): Promise<unknown[]> {
  clock = 0;
  tick();
  const out: unknown[] = [];
  const seeded = await b.readObject(actor, spec, { deal: '0000010001' });
  out.push(seeded);
  tick();
  out.push(await b.writeObject(actor, spec, {
    op: 'update', key: { deal: '0000010001' }, etag: seeded?.header.__etag, header: { name: 'Renamed deal' },
    items: [{ tab: 'flows', op: 'update', key: { deal: '0000010001', seq: '1' }, data: { amount: '12345.00' } }]
  }));
  out.push(await b.readObject(actor, spec, { deal: '0000010001' }));
  tick();
  const created = await b.writeObject(actor, spec, {
    op: 'create', key: { deal: '' },
    header: { name: 'New deal', product: '51A', counterparty: 'C1', amount: '1000.00', currency: 'INR', start: '2026-01-01', end: '2031-01-01', rate: '7.2500', remarks: 'made here', status: 'N' },
    items: [
      { tab: 'flows', op: 'create', key: { seq: '1' }, data: { seq: '1', payDate: '2027-01-01', flowType: 'INT', amount: '75.00', currency: 'INR' } },
      { tab: 'flows', op: 'create', key: { seq: '2' }, data: { seq: '2', payDate: '2028-01-01', flowType: 'REP', amount: '1000.00', currency: 'INR' } }
    ]
  });
  out.push(created, await b.readObject(actor, spec, created));
  tick();
  const release = dealsDef.actions?.[0].mock;
  await b.action(actor, spec, { deal: '0000010002' }, undefined, 'release', release && (h => release(h, {})));
  await b.action(actor, spec, { deal: '0000010004' }, undefined, 'release');
  out.push(await b.readObject(actor, spec, { deal: '0000010002' }), await b.readObject(actor, spec, { deal: '0000010004' }));
  tick();
  out.push(await b.writeObject(actor, spec, { op: 'delete', key: { deal: '0000010003' }, header: {}, items: [] }));
  out.push(await b.readObject(actor, spec, { deal: '0000010003' }));
  const list = dealsDef.list;
  out.push(await b.query(actor, 'deals', list, { filters: [], page: 1, pageSize: 50 }));
  out.push(await b.query(actor, 'deals', list, { search: 'deal', filters: [{ field: 'status', op: 'eq', values: ['R'] }], page: 1, pageSize: 50 }));
  // 250 keys: three statements of at most 100 keys, in key order.
  const flowKeys = Array.from({ length: 125 }, (_, i) => String(10001 + i).padStart(10, '0')).flatMap(deal => [{ deal, seq: '1' }, { deal, seq: '2' }]);
  out.push(await b.readKeys(actor, 'flows', flowKeys));
  out.push(await b.readKeys(actor, 'deals', [{ deal: '0000010003' }, { deal: '0000012001' }, { deal: 'nope' }]));
  out.push(await b.readKeys(actor, 'unknown', [{ deal: '0000010001' }]));
  out.push(await b.lookups(actor));
  out.push(await b.load(actor));
  return out;
}

describe('tableBackend', () => {
  it('gives the same results as localBackend for reads, writes, actions, deletes, queries and loads', async () => {
    const { driver } = database(dealsTables);
    const table = await scenario(tableBackend(DEALS, dealsEntry, driver, dealsTables));
    const local = await scenario(moduleLocalBackend(DEALS, dealsEntry, memoryStateStore()));
    expect(table[3]).toEqual({ deal: '0000012001' });
    expect((table[2] as { header: Row }).header).toMatchObject({ name: 'Renamed deal', __etag: `W/"local-${Date.UTC(2026, 9, 27, 10, 2)}-1"` });
    expect(table[8]).toBeNull();
    expect(table).toEqual(local);
  });

  it('seeds once: a second backend on the same database inserts nothing again', async () => {
    const { db, driver } = database(dealsTables);
    await tableBackend(DEALS, dealsEntry, driver, dealsTables).readObject(actor, spec, { deal: '0000010001' });
    expect(count(db, 'sample_deals__deals')).toBe(2000);
    db.exec(`DELETE FROM "sample_deals__deals" WHERE "deal" = '0000010005'`);
    const second = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    expect(await second.readObject(actor, spec, { deal: '0000010005' })).toBeNull();
    expect(count(db, 'sample_deals__deals')).toBe(1999);
  });

  it('seeds once when two backends race on one database', async () => {
    const { db, driver } = database(dealsTables);
    const [a, b] = [tableBackend(DEALS, dealsEntry, driver, dealsTables), tableBackend(DEALS, dealsEntry, driver, dealsTables)];
    await Promise.all([a.readObject(actor, spec, { deal: '0000010001' }), b.readObject(actor, spec, { deal: '0000010001' })]);
    expect(count(db, 'sample_deals__deals')).toBe(2000);
    expect(count(db, 'app_modules')).toBe(1);
  });

  it('writes the app_modules row on the first read', async () => {
    const { db, driver } = database(dealsTables);
    const b = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    expect(count(db, 'app_modules')).toBe(0);
    await b.query(actor, 'deals', dealsDef.list, { filters: [], page: 1, pageSize: 10 });
    expect(db.prepare('SELECT module_id, seeded_at FROM app_modules').all()).toEqual([{ module_id: DEALS, seeded_at: '2026-10-27T10:01:00.000Z' }]);
  });

  it('refuses a missing table with a 500 that names it, and other modules keep working', async () => {
    const stamped = stampedModule([{ id: 'A', qty: '1', note: 'a' }]);
    const stampedTables = moduleSchema('stamped', stamped);
    const { db, driver } = database(stampedTables);
    const deals = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    const message = "The table sample_deals__deals does not exist yet: FS Sprint creates it after the agent's turn (or run npm run gen-schema).";
    await expect(deals.query(actor, 'deals', dealsDef.list, { filters: [], page: 1, pageSize: 10 })).rejects.toMatchObject({ status: 500, message });
    expect(count(db, 'app_modules')).toBe(0);
    const other = tableBackend('stamped', stamped, driver, stampedTables);
    expect((await other.load(actor)).tables.rows).toEqual([{ id: 'A', qty: '1', note: 'a', cby: '', con: '', cat: '', mby: '', mon: '', mat: '' }]);
    // Once the tables are there, the same backend seeds and reads.
    for (const t of dealsTables) db.exec(createTableSql(t));
    expect(await deals.readObject(actor, spec, { deal: '0000010001' })).not.toBeNull();
  });

  it('refuses a table dropped after seeding with the same 500', async () => {
    const { db, driver } = database(dealsTables);
    const b = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    await b.readObject(actor, spec, { deal: '0000010001' });
    db.exec('DROP TABLE "sample_deals__flows"');
    await expect(b.readObject(actor, spec, { deal: '0000010001' })).rejects.toMatchObject({ status: 500, message: "The table sample_deals__flows does not exist yet: FS Sprint creates it after the agent's turn (or run npm run gen-schema)." });
  });

  it('refuses a table that misses a column of the module definition with a 500 that says how to update it', async () => {
    const stamped = stampedModule([{ id: 'A', qty: '1', note: 'a' }]);
    const tables = moduleSchema('stamped', stamped);
    const stale = { ...tables[0], columns: tables[0].columns.filter(c => c.name !== 'note') };
    const { driver } = database([stale]);
    const b = tableBackend('stamped', stamped, driver, tables);
    const message = "The table stamped__rows does not match the module definition yet: FS Sprint updates it after the agent's turn (or run npm run gen-schema).";
    await expect(b.load(actor)).rejects.toMatchObject({ status: 500, message });
    // MySQL's refusal of the same insert.
    const unknown = Object.assign(new Error("Unknown column 'note' in 'field list'"), { code: 'ER_BAD_FIELD_ERROR' });
    const mysqlStale: Driver = { ...driver, transaction: work => driver.transaction(tx => work({ ...tx, run: async (sql, p) => (/stamped__rows/.test(sql) ? Promise.reject(unknown) : tx.run(sql, p)) })) };
    await expect(tableBackend('stamped', stamped, mysqlStale, tables).apply(actor, 'rows', [])).rejects.toMatchObject({ status: 500, message });
  });

  it('stamps created and changed rows exactly as applyLocal does', async () => {
    const stamped = stampedModule();
    const tables = moduleSchema('stamped', stamped);
    const { driver } = database(tables);
    const b = tableBackend('stamped', stamped, driver, tables);
    const create: PlanOp[] = [{ op: 'create', id: 'A', key: { id: 'A' }, data: { id: 'A', qty: '5', note: 'first' } }, { op: 'create', id: 'B', key: { id: 'B' }, data: { id: 'B', qty: '7', note: 'second' } }];
    const update: PlanOp[] = [{ op: 'update', id: 'A', key: { id: 'A' }, data: { qty: '6' } }];
    const remove: PlanOp[] = [{ op: 'delete', id: 'B', key: { id: 'B' } }];
    let expected = applyLocal({ keys: ['id'] }, STAMPS, [], create, actor.username);
    await b.apply(actor, 'rows', create);
    tick();
    expected = applyLocal({ keys: ['id'] }, STAMPS, expected, update, actor.username);
    await b.apply(actor, 'rows', update);
    expected = applyLocal({ keys: ['id'] }, STAMPS, expected, remove, actor.username);
    await b.apply(actor, 'rows', remove);
    expect(expected[0]).toMatchObject({ cby: 'TESTER', mby: 'TESTER' });
    expect(expected[0].con).not.toBe(''); expect(expected[0].mat).not.toBe(expected[0].cat);
    const state = await b.load(actor);
    expect(state.tables.rows).toEqual(expected);
    expect(state.lookups).toEqual({ units: [{ CODE: 'EA' }] });
    await expect(b.apply(actor, 'nope', create)).rejects.toMatchObject({ status: 404, message: 'Unknown table.' });
  });

  it('drops seed values that have no column', async () => {
    const stamped = stampedModule([{ id: 'A', qty: '1', note: 'a', extra: 'gone' }]);
    const tables = moduleSchema('stamped', stamped);
    const { driver } = database(tables);
    expect((await tableBackend('stamped', stamped, driver, tables).load(actor)).tables.rows[0]).not.toHaveProperty('extra');
  });

  it('hands out copies of the lookups', async () => {
    const stamped = stampedModule();
    const tables = moduleSchema('stamped', stamped);
    const b = tableBackend('stamped', stamped, database(tables).driver, tables);
    (await b.lookups(actor)).units.push({ CODE: 'KG' });
    expect(await b.lookups(actor)).toEqual({ units: [{ CODE: 'EA' }] });
  });

  it('calls a seed function once per backend', async () => {
    const stamped = stampedModule([{ id: 'A', qty: '1', note: 'a' }]);
    const data = stamped.seed;
    const seed = vi.fn((): ModuleSeed => data as ModuleSeed);
    const entry: ModuleData = { ...stamped, seed };
    const tables = moduleSchema('stamped', entry);
    const b = tableBackend('stamped', entry, database(tables).driver, tables);
    await b.lookups(actor);
    await b.load(actor);
    expect(seed).toHaveBeenCalledTimes(1);
  });
});

describe('tableBackend duplicate keys', () => {
  const stampedRows = async (b: Backend) => (await b.load(actor)).tables.rows;
  const setup = (rows: Row[]) => {
    const stamped = stampedModule(rows);
    const tables = moduleSchema('stamped', stamped);
    const { db, driver } = database(tables);
    return { db, driver, tables, stamped, b: tableBackend('stamped', stamped, driver, tables) };
  };
  const create = (id: string, qty = '9'): PlanOp => ({ op: 'create', id, key: { id }, data: { id, qty, note: 'new' } });

  it('refuses a create whose key is stored, and keeps the stored row', async () => {
    const { b } = setup([{ id: 'A', qty: '1', note: 'a' }]);
    const before = await stampedRows(b);
    await expect(b.apply(actor, 'rows', [create('A')])).rejects.toMatchObject({ status: 409, message: 'A already exists.' });
    expect(await stampedRows(b)).toEqual(before);
  });

  it('refuses a create whose text key differs only in case', async () => {
    const { b } = setup([{ id: 'ABC', qty: '1', note: 'a' }]);
    await expect(b.apply(actor, 'rows', [create('abc')])).rejects.toMatchObject({ status: 409, message: 'abc already exists.' });
    expect((await stampedRows(b)).map(r => r.id)).toEqual(['ABC']);
  });

  it('refuses an object create whose key differs only in case', async () => {
    const { driver } = database(dealsTables);
    const b = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    const write = (deal: string) => b.writeObject(actor, spec, { op: 'create', key: { deal }, header: { name: deal }, items: [] });
    expect(await write('XY1')).toEqual({ deal: 'XY1' });
    await expect(write('xy1')).rejects.toMatchObject({ status: 409, message: 'xy1 already exists.' });
    expect((await b.readObject(actor, spec, { deal: 'XY1' }))?.header.name).toBe('XY1');
  });

  it('deletes a key and creates its other case in one change', async () => {
    const { b } = setup([{ id: 'ABC', qty: '1', note: 'a' }]);
    await b.apply(actor, 'rows', [{ op: 'delete', id: 'ABC', key: { id: 'ABC' } }, create('abc')]);
    expect((await stampedRows(b)).map(r => r.id)).toEqual(['abc']);
  });

  it('turns the database refusing a stored key into the same 409', async () => {
    const { driver: real, tables, stamped } = setup([{ id: 'A', qty: '1', note: 'a' }]);
    await tableBackend('stamped', stamped, real, tables).load(actor);
    // Another writer's row that this transaction cannot see: every read comes back empty.
    const blind: Driver = { ...real, transaction: work => real.transaction(tx => work({ ...tx, all: async () => [] })) };
    await expect(tableBackend('stamped', stamped, blind, tables).apply(actor, 'rows', [create('A')]))
      .rejects.toMatchObject({ status: 409, message: 'A already exists.' });
  });

  it('refuses an action that moves a header onto a stored key', async () => {
    const { driver } = database(dealsTables);
    const b = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    await expect(b.action(actor, spec, { deal: '0000010001' }, undefined, 'move', h => ({ ...h, deal: '0000010002' })))
      .rejects.toMatchObject({ status: 409, message: '0000010002 already exists.' });
  });
});

describe('tableBackend values that do not fit their column', () => {
  const create = (data: Row): PlanOp => ({ op: 'create', id: data.id, key: { id: data.id }, data });
  const setup = () => {
    const stamped = stampedModule([{ id: 'A', qty: '1', note: 'a' }]);
    const tables = moduleSchema('stamped', stamped);
    const { db, driver } = database(tables);
    return { db, b: tableBackend('stamped', stamped, driver, tables) };
  };

  it('refuses text longer than its column on apply, and writes nothing', async () => {
    const { b } = setup();
    await expect(b.apply(actor, 'rows', [create({ id: 'B', qty: '1', note: 'n'.repeat(41) })])).rejects.toMatchObject({ status: 400, message: 'Note: at most 40 characters.' });
    await expect(b.apply(actor, 'rows', [{ op: 'update', id: 'A', key: { id: 'A' }, data: { note: 'n'.repeat(41) } }])).rejects.toMatchObject({ status: 400, message: 'Note: at most 40 characters.' });
    await expect(b.apply(actor, 'rows', [create({ id: 'ABCDE', qty: '1' })])).rejects.toMatchObject({ status: 400, message: 'Id: at most 4 characters.' });
    expect((await b.load(actor)).tables.rows.map(r => [r.id, r.note])).toEqual([['A', 'a']]);
  });

  it('refuses an integer outside BIGINT on apply', async () => {
    const { b } = setup();
    await expect(b.apply(actor, 'rows', [create({ id: 'B', qty: '9223372036854775808' })])).rejects.toMatchObject({ status: 400, message: 'Qty: the number is too large.' });
    await expect(b.apply(actor, 'rows', [create({ id: 'B', qty: '-9223372036854775809' })])).rejects.toMatchObject({ status: 400, message: 'Qty: the number is too large.' });
  });

  it('keeps a 19-digit integer exactly', async () => {
    const { db, b } = setup();
    await b.apply(actor, 'rows', [create({ id: 'B', qty: '9223372036854775807' }), create({ id: 'C', qty: '-9223372036854775808' })]);
    expect((await b.load(actor)).tables.rows.map(r => r.qty)).toEqual(['1', '9223372036854775807', '-9223372036854775808']);
    expect(db.prepare(`SELECT typeof("qty") AS t FROM "stamped__rows" WHERE "id" = 'B'`).get()).toEqual({ t: 'integer' });
    const page = await b.query(actor, 'rows', { entity: 'rows', keys: ['id'], fields: [], defaultSort: { field: 'id', dir: 1 } } as never, { filters: [], page: 1, pageSize: 10 });
    expect(page.rows.map(r => r.qty)).toEqual(['1', '9223372036854775807', '-9223372036854775808']);
  });

  it('refuses a decimal with too many digits before the point or too many decimals on writeObject', async () => {
    const { driver } = database(dealsTables);
    const b = tableBackend(DEALS, dealsEntry, driver, dealsTables);
    const seeded = await b.readObject(actor, spec, { deal: '0000010001' });
    const update = (header: Row, items: { tab: string; op: 'update' | 'create'; key: Row; data: Row }[] = []) =>
      b.writeObject(actor, spec, { op: 'update', key: { deal: '0000010001' }, etag: seeded?.header.__etag, header, items });
    await expect(update({ amount: '10000000000000.00' })).rejects.toMatchObject({ status: 400, message: 'Amount: at most 13 digits before the decimal point.' });
    await expect(update({ rate: '1.23456' })).rejects.toMatchObject({ status: 400, message: 'Interest Rate %: at most 4 decimals.' });
    await expect(update({ name: 'n'.repeat(61) })).rejects.toMatchObject({ status: 400, message: 'Deal Name: at most 60 characters.' });
    await expect(update({}, [{ tab: 'flows', op: 'create', key: { seq: '99999999999999999999' }, data: { amount: '1.00' } }])).rejects.toMatchObject({ status: 400, message: 'No.: the number is too large.' });
    await expect(b.writeObject(actor, spec, { op: 'create', key: { deal: 'D'.repeat(11) }, header: { name: 'x' }, items: [] })).rejects.toMatchObject({ status: 400, message: 'Deal: at most 10 characters.' });
    expect(await update({ amount: '9999999999999.99', rate: '1.2340' })).toEqual({ deal: '0000010001' });
    expect((await b.readObject(actor, spec, { deal: '0000010001' }))?.header).toMatchObject({ amount: '9999999999999.99', rate: '1.2340' });
  });
});
