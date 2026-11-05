import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SERVER_MODULES } from '@/modules/server-registry';
import { createIndexSql, createTableSql } from '../../src/schema/ddl';
import { diffSchema, readSchema } from '../../src/schema/diff';
import { moduleSchema, type TableSpec } from '../../src/schema/wanted';

const specs = (): TableSpec[] => moduleSchema('sample-deals', SERVER_MODULES['sample-deals']);
const apply = (db: DatabaseSync, ts: TableSpec[]) => {
  for (const t of ts) {
    db.exec(createTableSql(t));
    for (const ix of t.indexes) db.exec(createIndexSql(t.name, ix));
  }
};
const fresh = (ts = specs()) => { const db = new DatabaseSync(':memory:'); apply(db, ts); return db; };

describe('ddl', () => {
  it('renders a text key with NOCASE and a PRIMARY KEY clause', () => {
    const sql = createTableSql(specs()[0]);
    expect(sql).toMatch(/"deal" VARCHAR\(\d+\) NOT NULL COLLATE NOCASE/);
    expect(sql).toContain('PRIMARY KEY ("deal")');
    expect(sql.endsWith(';\n')).toBe(true);
  });
});

describe('diffSchema', () => {
  it('creates the tables and the flows index on an empty database, and the statements run', () => {
    const ts = specs();
    const { statements, warnings, refusals } = diffSchema(readSchema(new DatabaseSync(':memory:')), ts);
    expect(statements.filter(s => s.startsWith('CREATE TABLE'))).toHaveLength(ts.length);
    expect(statements.some(s => s.startsWith('CREATE INDEX'))).toBe(true);
    // A teammate's migration of the same number may create the same table first.
    expect(statements.filter(s => s.startsWith('CREATE')).every(s => /^CREATE (TABLE|INDEX) IF NOT EXISTS /.test(s))).toBe(true);
    expect(warnings).toEqual([]);
    expect(refusals).toEqual([]);
    const db = new DatabaseSync(':memory:');
    for (const s of statements) db.exec(s);
    expect(diffSchema(readSchema(db), ts).statements).toEqual([]);
  });

  it('is empty after the statements are executed', () => {
    const ts = specs();
    const d = diffSchema(readSchema(fresh(ts)), ts);
    expect(d).toEqual({ statements: [], warnings: [], refusals: [] });
  });

  it('adds a missing column as nullable', () => {
    const ts = specs();
    const db = fresh(ts);
    ts[0].columns.push({ name: 'note', type: 'VARCHAR(40)', kind: 'string', notNull: false, nocase: false });
    expect(diffSchema(readSchema(db), ts).statements).toEqual(['ALTER TABLE "sample_deals__deals" ADD COLUMN "note" VARCHAR(40);\n']);
  });

  it('refuses a changed type and emits nothing for it', () => {
    const ts = specs();
    const db = fresh(ts);
    const wanted = specs();
    const name = wanted[0].columns.find(c => c.name === 'name')!;
    const old = name.type;
    name.type = 'VARCHAR(120)';
    const d = diffSchema(readSchema(db), wanted);
    expect(d.refusals).toHaveLength(1);
    expect(d.refusals[0]).toContain(`changed from ${old} to VARCHAR(120)`);
    expect(d.refusals[0]).toContain('after it was pushed; keep the old definition, or add a new field.');
    expect(d.statements).toEqual([]);
  });

  it('compares types ignoring case and spaces', () => {
    const ts = specs();
    const db = fresh(ts);
    const wanted = specs();
    const c = wanted[0].columns.find(x => x.type.startsWith('DECIMAL'));
    if (c) c.type = c.type.toLowerCase().replace(',', ', ');
    expect(diffSchema(readSchema(db), wanted).refusals).toEqual([]);
  });

  it('refuses a changed primary key', () => {
    const db = fresh();
    const wanted = specs();
    wanted[0].primaryKey = ['deal', 'name'];
    const d = diffSchema(readSchema(db), wanted);
    expect(d.refusals.length).toBeGreaterThan(0);
    expect(d.refusals[0]).toContain('changed from');
  });

  it('warns about a column no longer wanted and keeps it', () => {
    const db = fresh();
    const wanted = specs();
    const gone = wanted[0].columns.pop()!;
    const d = diffSchema(readSchema(db), wanted);
    expect(d.warnings).toContain(`\`${wanted[0].name}.${gone.name}\` is no longer in the module definition; it is kept.`);
    expect(d.statements).toEqual([]);
  });

  it('warns about a table no longer wanted', () => {
    const db = fresh();
    const d = diffSchema(readSchema(db), []);
    expect(d.warnings.length).toBe(specs().length);
    expect(d.warnings[0]).toMatch(/is no longer in the module definition; it is kept\.$/);
  });

  it('adds a missing index, compared by columns not name', () => {
    const ts = specs();
    const db = fresh(ts);
    ts[0].indexes.push({ name: 'ix_new', columns: ['name', 'deal'] });
    expect(diffSchema(readSchema(db), ts).statements).toEqual([createIndexSql(ts[0].name, { name: 'ix_new', columns: ['name', 'deal'] }, true)]);
    const renamed = specs();
    renamed.forEach(t => t.indexes.forEach(i => { i.name = 'other_' + i.name; }));
    expect(diffSchema(readSchema(db), renamed).statements).toEqual([]);
  });

  it('keeps text keys case-insensitive (NOCASE)', () => {
    const db = fresh();
    const t = specs()[0];
    const key = t.primaryKey[0];
    db.exec(`INSERT INTO "${t.name}" ("${key}") VALUES ('abc')`);
    expect(() => db.exec(`INSERT INTO "${t.name}" ("${key}") VALUES ('ABC')`)).toThrow(/UNIQUE/);
  });
});
