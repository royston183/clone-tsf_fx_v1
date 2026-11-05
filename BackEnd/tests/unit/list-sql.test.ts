import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import type { AnyList, ListQuery } from '@/lib/list/types';
import { applyQuery } from '@core/server/list-query';
import { sqliteDriver } from '../../src/db';
import { addColumnSql, createTableSql } from '../../src/schema/ddl';
import type { ColumnSpec, TableSpec } from '../../src/schema/wanted';
import type { Driver } from '../../src/tables/driver';
import { canQueryInSql, exact, listSql, queryTable, quoteId, toParams, toRow } from '../../src/tables/list-sql';

const col = (name: string, type: string, kind: ColumnSpec['kind'], more: Partial<ColumnSpec> = {}): ColumnSpec =>
  ({ name, type, kind, notNull: false, nocase: false, ...more });

const deals: TableSpec = {
  name: 'deals', moduleId: 'deals', entity: 'deals', primaryKey: ['deal'], indexes: [], etag: true,
  columns: [
    col('deal', 'VARCHAR(6)', 'string', { notNull: true, nocase: true }),
    col('name', 'VARCHAR(40)', 'string'),
    col('type', 'TEXT', 'string'),
    col('amount', 'DECIMAL(15,2)', 'decimal', { scale: 2 }),
    col('start', 'DATE', 'date'),
    col('term', 'BIGINT', 'integer'),
    col('active', 'CHAR(1)', 'string'),
    col('note', 'TEXT', 'string'),
    col('etag', 'VARCHAR(64)', 'string')
  ]
};

const list: AnyList = {
  entity: 'deals', keys: ['deal'], columns: [],
  fields: [
    { field: 'deal', label: 'Deal', type: 'integer', max: 6, keepZeros: true },
    { field: 'name', label: 'Name', type: 'text', max: 40 },
    { field: 'type', label: 'Type', type: 'select', options: [{ value: '01', label: 'Loan' }, { value: '02', label: 'Deposit' }, { value: '03', label: 'Swap' }] },
    { field: 'amount', label: 'Amount', type: 'amount' },
    { field: 'start', label: 'Start', type: 'date' },
    { field: 'term', label: 'Term', type: 'integer', max: 3 },
    { field: 'active', label: 'Active', type: 'flag' },
    { field: 'note', label: 'Note', type: 'text' }
  ],
  search: ['name', 'note'], filters: ['deal', 'name', 'type', 'amount', 'start', 'term', 'active'],
  sort: ['name', 'amount', 'start', 'term'], defaultSort: { field: 'deal', dir: 1 }, pageSizes: [10, 50]
};

const NAMES = ['alpha', 'Alpha', 'ALPHA', 'beta', 'Bravo', 'charlie', 'Charlie', '', 'Émile', 'echo', 'Echo', 'alphabet', 'zulu'];
const AMOUNTS = ['100.00', '-50.25', '', '100.00', '2500.50', '0.00', '99.99', '', '-1000.00', '500.00', '1000.10'];
const DATES = ['2026-04-01', '', '2025-12-31', '2026-04-01', '2026-01-15', '', '2026-10-27'];
const TERMS = ['12', '', '3', '120', '7', '12'];

/** 30 rows, inserted out of key order: mixed case, empty amounts, dates and terms, ties, a NUMC key. */
const fixture: Row[] = Array.from({ length: 30 }, (_, i) => ({
  deal: String(((i * 37) % 1000) + 1).padStart(6, '0'),
  name: NAMES[i % NAMES.length],
  type: ['01', '02', '03'][i % 3],
  amount: AMOUNTS[i % AMOUNTS.length],
  start: DATES[i % DATES.length],
  term: TERMS[i % TERMS.length],
  active: i % 4 === 0 ? '' : 'X',
  note: i % 5 === 0 ? `Al note ${i}` : `note ${i}`,
  ...(i === 3 ? { __etag: 'W/"3"' } : {})
}));

const insert = async (d: Driver, t: TableSpec, row: Row) => {
  const p = toParams(t, row);
  const cols = Object.keys(p);
  await d.run(`INSERT INTO ${quoteId('sqlite', t.name)} (${cols.map(c => quoteId('sqlite', c)).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(p));
};
const setup = async (t: TableSpec, rows: Row[]) => {
  const db = new DatabaseSync(':memory:');
  db.exec(createTableSql(t));
  const d = sqliteDriver(db);
  for (const r of rows) await insert(d, t, r);
  return { db, d };
};
/** Every row as `toRow` returns it, in insertion order. */
const stored = async (d: Driver, t: TableSpec) => (await d.all(`SELECT * FROM ${quoteId('sqlite', t.name)} ORDER BY rowid`)).map(r => toRow(t, r));
const query = (more: Partial<ListQuery>): ListQuery => ({ filters: [], page: 1, pageSize: 50, ...more });

describe('toRow and toParams', () => {
  it('reads NULL as empty, decimals to their scale, integers as digits, etag as __etag', () => {
    expect(toRow(deals, { deal: '000001', name: null, type: '01', amount: 100, start: null, term: 42, active: 'X', note: 'n', etag: 'W/"1"' }))
      .toEqual({ deal: '000001', name: '', type: '01', amount: '100.00', start: '', term: '42', active: 'X', note: 'n', __etag: 'W/"1"' });
    expect(toRow(deals, { deal: '2', amount: '100.5', term: '12345678901234567', etag: null })).toMatchObject({ amount: '100.50', term: '12345678901234567' });
    expect(toRow(deals, { deal: '2', amount: -0.5, term: BigInt(7) })).toMatchObject({ amount: '-0.50', term: '7' });
    expect(toRow(deals, { deal: '2', etag: null })).not.toHaveProperty('__etag');
    const plain: TableSpec = { ...deals, etag: false };
    expect(toRow(plain, { deal: '2', etag: 'x' })).toMatchObject({ etag: 'x' });
  });
  it('writes empty numbers and dates as NULL, empty text as empty, __etag into etag', () => {
    expect(toParams(deals, { deal: '000001', name: '', type: '01', amount: '', start: '', term: '', active: '', note: 'n', __etag: 'W/"1"' }))
      .toEqual({ deal: '000001', name: '', type: '01', amount: null, start: null, term: null, active: '', note: 'n', etag: 'W/"1"' });
    expect(toParams(deals, { deal: '1', amount: '1.50', start: '2026-04-01', term: '3' })).toMatchObject({ amount: '1.50', start: '2026-04-01', term: '3', etag: null });
  });
  it('quotes names and compares text exactly on both engines', () => {
    expect(quoteId('sqlite', 'a"b')).toBe('"a""b"');
    expect(quoteId('mysql', 'a`b')).toBe('`a``b`');
    expect(exact('sqlite', 'name')).toBe('"name" COLLATE BINARY');
    expect(exact('mysql', 'name')).toBe('CAST(`name` AS BINARY)');
  });
});

describe('queryTable parity with applyQuery', () => {
  const cases: [string, Partial<ListQuery>, boolean?][] = [
    ['no filter', {}],
    ['search', { search: 'al' }, true],
    ['search, any case', { search: 'aL' }, true],
    ['eq on text', { filters: [{ field: 'name', op: 'eq', values: ['alpha'] }] }, true],
    ['in', { filters: [{ field: 'type', op: 'in', values: ['01', '03'] }] }, true],
    ['contains', { filters: [{ field: 'name', op: 'contains', values: ['ha'] }] }, true],
    ['between on an amount, open start', { filters: [{ field: 'amount', op: 'between', values: ['', '100.00'] }] }, true],
    ['between on an amount, open end', { filters: [{ field: 'amount', op: 'between', values: ['99.99', ''] }] }, true],
    ['between on a date', { filters: [{ field: 'start', op: 'between', values: ['2026-01-01', '2026-04-01'] }] }, true],
    ['between on a date, open start', { filters: [{ field: 'start', op: 'between', values: ['', '2026-01-15'] }] }, true],
    ['eq on an amount', { filters: [{ field: 'amount', op: 'eq', values: ['100.00'] }] }, true],
    ['eq on the NUMC key, unpadded', { filters: [{ field: 'deal', op: 'eq', values: ['38'] }] }, true],
    ['between on the NUMC key', { filters: [{ field: 'deal', op: 'between', values: ['100', '000500'] }] }, true],
    ['between on an integer', { filters: [{ field: 'term', op: 'between', values: ['', '12'] }] }, true],
    ['eq on a flag, not set', { filters: [{ field: 'active', op: 'eq', values: [''] }] }, true],
    ['search and filters together', { search: 'note', filters: [{ field: 'active', op: 'eq', values: ['X'] }, { field: 'type', op: 'eq', values: ['02'] }] }, true],
    ['sort by text ascending', { sort: { field: 'name', dir: 1 } }],
    ['sort by text descending', { sort: { field: 'name', dir: -1 } }],
    ['sort by amount', { sort: { field: 'amount', dir: 1 } }],
    ['sort by amount descending', { sort: { field: 'amount', dir: -1 } }],
    ['sort by date descending', { sort: { field: 'start', dir: -1 } }],
    ['sort by integer', { sort: { field: 'term', dir: 1 } }],
    ['page 2 of size 10', { sort: { field: 'name', dir: 1 }, page: 2, pageSize: 10 }],
    ['page past the end', { page: 4, pageSize: 10 }]
  ];
  for (const numeric of [new Set<string>(), new Set(['term', 'deal'])]) {
    for (const [name, more, narrows] of cases) {
      it(`${name} (numbers: ${[...numeric].join(',') || 'none'})`, async () => {
        const { d } = await setup(deals, fixture);
        const rows = await stored(d, deals);
        const q = query(more);
        const want = applyQuery(rows, q, list, numeric, { caseless: true });
        if (narrows) expect(want.total).toBeGreaterThan(0);
        if (narrows) expect(want.total).toBeLessThan(30);
        expect(await queryTable(d, deals, list, q, numeric)).toEqual(want);
      });
    }
  }
  it('search ignores the case of A–Z, never accents: alpha, Alpha, ALPHA and alphabet for "ALPHA", no Émile for "émile"', async () => {
    const { d } = await setup(deals, fixture);
    const names = (await queryTable(d, deals, list, query({ search: 'ALPHA' }), new Set())).rows.map(r => r.name);
    expect([...new Set(names)].sort()).toEqual(['ALPHA', 'Alpha', 'alpha', 'alphabet']);
    expect((await queryTable(d, deals, list, query({ search: 'émile' }), new Set())).total).toBe(0);
  });
  it('uses SQL for this list', () => expect(canQueryInSql(deals, list)).toBe(true));
});

describe('empty and case rules', () => {
  it('a row added before ADD COLUMN matches eq \'\' on the new column (Review Focus 2)', async () => {
    const before: TableSpec = { name: 'flags', moduleId: 'm', entity: 'flags', primaryKey: ['id'], indexes: [], etag: false,
      columns: [col('id', 'VARCHAR(10)', 'string', { notNull: true, nocase: true }), col('name', 'TEXT', 'string')] };
    const released = col('released', 'CHAR(1)', 'string');
    const after: TableSpec = { ...before, columns: [...before.columns, released] };
    const { db, d } = await setup(before, [{ id: 'z', name: 'old' }]);
    db.exec(addColumnSql('flags', released));
    await insert(d, after, { id: 'b', name: 'set', released: 'X' });
    await insert(d, after, { id: 'c', name: 'unset', released: '' });
    const flags: AnyList = { entity: 'flags', keys: ['id'], columns: [],
      fields: [{ field: 'id', label: 'Id', type: 'text', max: 10 }, { field: 'name', label: 'Name', type: 'text' }, { field: 'released', label: 'Released', type: 'flag' }],
      filters: ['released'], sort: ['released'], defaultSort: { field: 'id', dir: 1 }, pageSizes: [50] };
    const q = query({ filters: [{ field: 'released', op: 'eq', values: [''] }] });
    const page = await queryTable(d, after, flags, q, new Set());
    expect(page.rows.map(r => r.id)).toEqual(['c', 'z']);
    expect(page).toEqual(applyQuery(await stored(d, after), q, flags));
    // NULL and '' are the same value when sorting: the key decides between them.
    const sorted = query({ sort: { field: 'released', dir: 1 } });
    expect(await queryTable(d, after, flags, sorted, new Set())).toEqual(applyQuery(await stored(d, after), sorted, flags));
  });

  it('a NOCASE key sorts and matches exactly (Review Focus 3)', async () => {
    const codes: TableSpec = { name: 'codes', moduleId: 'm', entity: 'codes', primaryKey: ['code'], indexes: [], etag: false,
      columns: [col('code', 'VARCHAR(10)', 'string', { notNull: true, nocase: true })] };
    const codeList: AnyList = { entity: 'codes', keys: ['code'], columns: [], fields: [{ field: 'code', label: 'Code', type: 'text', max: 10 }],
      filters: ['code'], defaultSort: { field: 'code', dir: 1 }, pageSizes: [50] };
    const { d } = await setup(codes, [{ code: 'abc' }, { code: 'Abd' }, { code: 'ABE' }]);
    const rows = await stored(d, codes);
    const asc = query({});
    expect((await queryTable(d, codes, codeList, asc, new Set())).rows.map(r => r.code)).toEqual(['ABE', 'Abd', 'abc']);
    expect(applyQuery(rows, asc, codeList).rows.map(r => r.code)).toEqual(['ABE', 'Abd', 'abc']);
    const eq = query({ filters: [{ field: 'code', op: 'eq', values: ['abc'] }] });
    expect((await queryTable(d, codes, codeList, eq, new Set())).rows.map(r => r.code)).toEqual(['abc']);
  });
});

describe('in-memory fallback', () => {
  it('searching a column that is not text falls back to applyQuery', async () => {
    const searchAmount: AnyList = { ...list, search: ['name', 'amount'] };
    expect(canQueryInSql(deals, searchAmount)).toBe(false);
    const { d } = await setup(deals, fixture);
    const q = query({ search: '100', sort: { field: 'amount', dir: -1 } });
    const want = applyQuery(await stored(d, deals), q, searchAmount, new Set());
    expect(want.total).toBeGreaterThan(0);
    expect(await queryTable(d, deals, searchAmount, q, new Set())).toEqual(want);
  });
  it('falls back when SQL would compare differently or a field has no column', () => {
    // A NUMC integer with no length is stored unpadded, but applyQuery compares it as a number.
    const loose: TableSpec = { ...deals, columns: [...deals.columns, col('seq', 'TEXT', 'string')] };
    const seqList: AnyList = { ...list, fields: [...list.fields, { field: 'seq', label: 'Seq', type: 'integer', keepZeros: true }], sort: ['seq'] };
    expect(canQueryInSql(loose, seqList)).toBe(false);
    // A numeric column that the list compares as text.
    expect(canQueryInSql(deals, { ...list, fields: list.fields.filter(f => f.field !== 'amount') })).toBe(false);
    expect(canQueryInSql(deals, { ...list, filters: ['missing'] })).toBe(false);
  });
});

describe('listSql on MySQL', () => {
  it('compares text as CAST(… AS BINARY) (never the deprecated BINARY operator), with backticks and only ? placeholders with string LIMIT and OFFSET', () => {
    const q = query({
      search: 'xq',
      filters: [{ field: 'name', op: 'in', values: ['Alpha', 'Beta'] }, { field: 'amount', op: 'between', values: ['', '500.00'] }, { field: 'deal', op: 'eq', values: ['7'] }],
      sort: { field: 'name', dir: -1 }, page: 3, pageSize: 10
    });
    const { sql, params, countSql, countParams } = listSql('mysql', deals, list, q, new Set());
    expect(sql).toContain('CAST(`name` AS BINARY)');
    expect(sql).toContain('INSTR(CAST(LOWER(`name`) AS BINARY), CAST(LOWER(?) AS BINARY)) > 0');
    // The deprecated operator form: BINARY followed by its operand.
    expect(sql + countSql).not.toMatch(/BINARY [`(A-Z]/);
    expect(sql).toContain('FROM `deals`');
    expect(sql).not.toContain('"');
    for (const v of ['xq', 'Alpha', 'Beta', '500.00', '000007']) {
      expect(sql).not.toContain(v);
      expect(countSql).not.toContain(v);
    }
    expect(params).toEqual(expect.arrayContaining(['xq', 'Alpha', 'Beta', '500.00', '000007']));
    expect(sql).toMatch(/LIMIT \? OFFSET \?$/);
    expect(params.slice(-2)).toEqual(['10', '20']);
    expect(countSql).not.toContain('LIMIT');
    expect(countParams).toEqual(params.slice(0, -2));
    expect(sql.split('?').length - 1).toBe(params.length);
  });
  it('passes LIMIT and OFFSET as numbers on SQLite', () => {
    const { params } = listSql('sqlite', deals, list, query({ page: 2, pageSize: 10 }), new Set());
    expect(params.slice(-2)).toEqual([10, 10]);
  });
});
