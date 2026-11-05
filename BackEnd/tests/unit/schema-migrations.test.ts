import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SERVER_MODULES } from '@/modules/server-registry';
import { migrate } from '../../src/db';
import { appRoot } from '../../src/platform-node';
import { applyPlan, frozenMigrations, GENERATED_MARK, generate, generatedFile, planMigrations, rebuildLocal } from '../../src/schema/migrations';
import { moduleSchema, type TableSpec } from '../../src/schema/wanted';

const REAL = path.join(appRoot(), 'DB', 'schema');
const specs = (): TableSpec[] => moduleSchema('sample-deals', SERVER_MODULES['sample-deals']);
const withColumn = (ts: TableSpec[]): TableSpec[] => ts.map((t, i) => i === 0
  ? { ...t, columns: [...t.columns, { name: 'extra_note', type: 'VARCHAR(40)', kind: 'string', notNull: false, nocase: false }] } : t);
function schemaDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'schema-'));
  for (const f of ['0001_init.sql', '0002_app_store.sql']) copyFileSync(path.join(REAL, f), path.join(dir, f));
  return dir;
}
const none = () => false;
/** The generated migration number `n`: NNNN_app_tables_<8 hex of its SQL's hash>.sql. */
const GEN = (n: number) => new RegExp(`^${String(n).padStart(4, '0')}_app_tables_[0-9a-f]{8}\\.sql$`);
const genFile = (dir: string, n: number): string => readdirSync(dir).find(f => GEN(n).test(f)) ?? '';
const versionOf = (file: string) => file.replace(/\.sql$/, '');
const blobSha = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
const OTHER_SQL = GENERATED_MARK + '\nCREATE TABLE IF NOT EXISTS "other__rows" ("id" TEXT NOT NULL, PRIMARY KEY ("id"));\n';
const columnsOf = (db: DatabaseSync, table: string) => (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(c => c.name);

describe('planMigrations', () => {
  it('writes the first generated migration, and is up to date once applied', () => {
    const dir = schemaDir();
    const plan = planMigrations(dir, none, specs());
    expect(plan.write?.file).toMatch(GEN(3));
    expect(plan.remove).toEqual([]);
    expect(plan.write?.sql.startsWith(GENERATED_MARK + '\n')).toBe(true);
    expect(plan.upToDate).toBe(false);
    expect(plan.warnings).toEqual([]);
    applyPlan(dir, plan);
    expect(planMigrations(dir, none, specs())).toEqual({ upToDate: true, remove: [], warnings: [], refusals: [] });
  });

  it('rewrites a pending migration when the definitions change', () => {
    const dir = schemaDir();
    const first = planMigrations(dir, none, specs());
    applyPlan(dir, first);
    const plan = planMigrations(dir, none, withColumn(specs()));
    expect(plan.write?.file).toMatch(GEN(3));
    expect(plan.write?.file).not.toBe(first.write?.file);
    expect(plan.write?.sql).toContain('"extra_note"');
    expect(plan.write?.sql).toContain('CREATE TABLE');
    expect(plan.remove).toEqual([first.write?.file]);
    applyPlan(dir, plan);
    expect(readdirSync(dir).sort()).toEqual(['0001_init.sql', '0002_app_store.sql', plan.write?.file]);
  });

  it('adds a new migration holding only the ADD COLUMN when the old one is frozen', () => {
    const dir = schemaDir();
    const first = planMigrations(dir, none, specs());
    applyPlan(dir, first);
    const plan = planMigrations(dir, f => f === first.write?.file, withColumn(specs()));
    expect(plan.write?.file).toMatch(GEN(4));
    expect(plan.remove).toEqual([]);
    expect(plan.write?.sql).toContain('ADD COLUMN "extra_note"');
    expect(plan.write?.sql).not.toContain('CREATE TABLE');
  });

  it('refuses a type change on a frozen column', () => {
    const dir = schemaDir();
    applyPlan(dir, planMigrations(dir, none, specs()));
    const changed = specs().map((t, i) => i === 0 ? { ...t, columns: t.columns.map((c, j) => j === 0 ? { ...c, type: 'INTEGER' } : c) } : t);
    expect(planMigrations(dir, () => true, changed).refusals).toHaveLength(1);
  });

  it('removes the pending file and writes none when nothing is wanted from it', () => {
    const dir = schemaDir();
    writeFileSync(path.join(dir, '0003_app_tables.sql'), GENERATED_MARK + '\n');
    const plan = planMigrations(dir, none, []);
    expect(plan.remove).toEqual(['0003_app_tables.sql']);
    expect(plan.write).toBeUndefined();
  });

  it('names a migration by its number and SQL, so only the same SQL gets the same name', () => {
    expect(generatedFile(5, OTHER_SQL)).toMatch(GEN(5));
    expect(generatedFile(5, OTHER_SQL)).toBe(generatedFile(5, OTHER_SQL.replace(/\n/g, '\r\n')));
    expect(generatedFile(5, OTHER_SQL + '-- other\n')).not.toBe(generatedFile(5, OTHER_SQL));
  });

  it("renames a pending migration whose number a teammate's pushed migration took, keeping its SQL", () => {
    const dir = schemaDir();
    const mine = planMigrations(dir, none, specs());
    applyPlan(dir, mine);
    const theirs = generatedFile(3, OTHER_SQL);
    writeFileSync(path.join(dir, theirs), OTHER_SQL);
    const plan = planMigrations(dir, f => f === theirs, specs());
    expect(plan.rename?.from).toBe(mine.write?.file);
    expect(plan.rename?.to).toMatch(GEN(4));
    // Same SQL, so the same hash after the new number.
    expect(plan.rename?.to.slice(4)).toBe(mine.write?.file.slice(4));
    expect(plan.write).toBeUndefined();
    expect(plan).toMatchObject({ remove: [], upToDate: false });
    applyPlan(dir, plan);
    expect(planMigrations(dir, f => f === theirs, specs())).toMatchObject({ upToDate: true, remove: [] });
  });

  it("builds a fresh database from two teammates' migrations of the same number that create the same table", () => {
    const a = schemaDir(), b = schemaDir();
    const mine = planMigrations(a, none, specs()), theirs = planMigrations(b, none, withColumn(specs()));
    expect(mine.write?.file).not.toBe(theirs.write?.file);
    const merged = schemaDir();
    for (const p of [mine, theirs]) writeFileSync(path.join(merged, p.write!.file), p.write!.sql);
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, merged)).not.toThrow();
    db.close();
    // Whichever ran first, the next generated migration brings the table to the merged definition.
    const pushed = (f: string) => f === mine.write?.file || f === theirs.write?.file;
    applyPlan(merged, planMigrations(merged, pushed, withColumn(specs())));
    const check = new DatabaseSync(':memory:');
    migrate(check, merged);
    expect(columnsOf(check, specs()[0].name)).toContain('extra_note');
    check.close();
  });
});

describe('frozenMigrations', () => {
  const sha = (text: string) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  const repo = (content: string): string => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'frozen-'));
    writeFileSync(path.join(root, '.git'), '');
    mkdirSync(path.join(root, 'DB', 'schema'), { recursive: true });
    writeFileSync(path.join(root, 'DB', 'schema', '0003_app_tables.sql'), content);
    return root;
  };
  const gitWith = (blob: string) => (args: string[]): string => {
    if (args[0] === 'for-each-ref') return 'refs/remotes/origin/main\nrefs/remotes/origin/dev\n';
    if (args[0] === 'ls-tree') return args[1].endsWith('/dev') ? `100644 blob ${blob}\tDB/schema/0003_app_tables.sql\n` : '';
    throw new Error('unexpected');
  };
  it('freezes nothing without a .git folder', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'frozen-'));
    expect(frozenMigrations(root, () => { throw new Error('not called'); })('0003_app_tables.sql')).toBe(false);
  });
  it('freezes nothing in a repository with no remote ref', () => {
    expect(frozenMigrations(repo('A'), () => '')('0003_app_tables.sql')).toBe(false);
  });
  it('freezes a file that a remote ref holds with the same content', () => {
    const frozen = frozenMigrations(repo('SAME\n'), gitWith(sha('SAME\n')));
    expect(frozen('0003_app_tables.sql')).toBe(true);
    expect(frozen('0004_app_tables.sql')).toBe(false);
  });
  it('freezes a CRLF checkout of the pushed file', () => {
    expect(frozenMigrations(repo('A\r\nB\r\n'), gitWith(sha('A\nB\n')))('0003_app_tables.sql')).toBe(true);
  });
  it('does not freeze a file whose name a teammate used with other content', () => {
    expect(frozenMigrations(repo('MINE\n'), gitWith(sha('THEIRS\n')))('0003_app_tables.sql')).toBe(false);
  });
  it('throws when git fails, never guessing not frozen', () => {
    expect(() => frozenMigrations(repo('A'), () => { throw new Error('boom'); })).toThrow(/Cannot tell which migrations were pushed: boom/);
    const lsFails = (args: string[]): string => { if (args[0] === 'ls-tree') throw new Error('bad ref'); return 'refs/remotes/origin/x'; };
    expect(() => frozenMigrations(repo('A'), lsFails)).toThrow(/Cannot tell which migrations were pushed/);
  });
});

describe('generate', () => {
  const root = (): string => {
    const r = mkdtempSync(path.join(os.tmpdir(), 'gen-'));
    mkdirSync(path.join(r, 'DB'), { recursive: true });
    cpSync(schemaDir(), path.join(r, 'DB', 'schema'), { recursive: true });
    return r;
  };
  const withDbPath = <T>(work: () => T): T => {
    const saved = process.env.DB_PATH;
    delete process.env.DB_PATH;
    try { return work(); } finally { if (saved !== undefined) process.env.DB_PATH = saved; }
  };
  const migrationsOf = (db: DatabaseSync) => (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[]).map(r => r.version);

  it('writes the file and builds the local database tables once when the new file has another number', () => withDbPath(() => {
    const r = root();
    const dir = path.join(r, 'DB', 'schema');
    const first = generate(r, specs(), () => '').lines;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^Wrote DB\/schema\/0003_app_tables_[0-9a-f]{8}\.sql$/);
    const file = path.join(r, 'DB', 'app.db');
    const db = new DatabaseSync(file);
    migrate(db, dir);
    db.close();
    writeFileSync(path.join(dir, '0003_x.sql'), 'CREATE TABLE "unrelated" ("id" TEXT NOT NULL PRIMARY KEY);\n');

    const { lines } = generate(r, withColumn(specs()), () => '');
    const fourth = genFile(dir, 4);
    expect(lines.at(-1)).toBe(`Wrote DB/schema/${fourth}`);
    expect(lines.some(l => l.startsWith('Rebuilt local tables: '))).toBe(true);
    expect(readdirSync(dir).sort()).toEqual(['0001_init.sql', '0002_app_store.sql', '0003_x.sql', fourth]);
    const check = new DatabaseSync(file);
    expect(migrationsOf(check)).toEqual(['0001_init', '0002_app_store', '0003_x', versionOf(fourth)]);
    expect(columnsOf(check, specs()[0].name)).toContain('extra_note');
    check.close();
  }));

  it('leaves the files unchanged when the undo fails', () => withDbPath(() => {
    const r = root();
    const dir = path.join(r, 'DB', 'schema');
    generate(r, specs(), () => '');
    const file = path.join(r, 'DB', 'app.db');
    const db = new DatabaseSync(file);
    migrate(db, dir);
    const first = specs()[0];
    db.exec(`CREATE TABLE child ("p" TEXT REFERENCES "${first.name}" ("${first.primaryKey[0]}"))`);
    db.exec(`INSERT INTO "${first.name}" ("${first.primaryKey[0]}") VALUES ('X1')`);
    db.exec("INSERT INTO child VALUES ('X1')");
    db.close();
    const before = readdirSync(dir).sort().map(f => [f, readFileSync(path.join(dir, f), 'utf8')]);

    expect(() => generate(r, withColumn(specs()), () => '')).toThrow();
    expect(readdirSync(dir).sort().map(f => [f, readFileSync(path.join(dir, f), 'utf8')])).toEqual(before);
    const check = new DatabaseSync(file);
    expect(migrationsOf(check)).toContain(versionOf(genFile(dir, 3)));
    expect(columnsOf(check, first.name)).not.toContain('extra_note');
    check.close();
  }));

  it("renumbers a pending migration after a teammate's merged one, keeping the local rows", () => withDbPath(() => {
    const r = root();
    writeFileSync(path.join(r, '.git'), '');
    const dir = path.join(r, 'DB', 'schema');
    generate(r, specs(), () => '');
    const mine = genFile(dir, 3);
    const file = path.join(r, 'DB', 'app.db');
    const db = new DatabaseSync(file);
    migrate(db, dir);
    const first = specs()[0];
    db.exec(`INSERT INTO "${first.name}" ("${first.primaryKey[0]}") VALUES ('KEEP')`);
    db.close();
    // Merge team changes brings a teammate's pushed migration with the same number.
    const theirs = generatedFile(3, OTHER_SQL);
    writeFileSync(path.join(dir, theirs), OTHER_SQL);
    const git = (args: string[]): string => args[0] === 'for-each-ref' ? 'refs/remotes/origin/team/b\n' : `100644 blob ${blobSha(OTHER_SQL)}\tDB/schema/${theirs}\n`;

    // The teammate's table is not in this test's definitions, so its warning is left out here.
    const lines = generate(r, specs(), git).lines.filter(l => !l.startsWith('Schema warning:'));
    const renamed = genFile(dir, 4);
    expect(lines).toEqual([`Wrote DB/schema/${renamed} (renamed from ${mine})`]);
    expect(readdirSync(dir).sort()).toEqual(['0001_init.sql', '0002_app_store.sql', theirs, renamed].sort());
    const check = new DatabaseSync(file);
    expect(migrationsOf(check)).toEqual(['0001_init', '0002_app_store', versionOf(theirs), versionOf(renamed)].sort());
    expect(check.prepare(`SELECT COUNT(*) AS n FROM "${first.name}"`).get()).toEqual({ n: 1 });
    expect(columnsOf(check, 'other__rows')).toEqual(['id']);
    check.close();
    expect(generate(r, specs(), git).lines.at(-1)).toBe('Schema: up to date.');
  }));
});


describe('rebuildLocal', () => {
  it('rebuilds a changed pending migration and keeps the frozen tables and their rows', () => {
    const dir = schemaDir();
    applyPlan(dir, planMigrations(dir, none, specs()));
    const db = new DatabaseSync(path.join(mkdtempSync(path.join(os.tmpdir(), 'db-')), 'app.db'));
    migrate(db, dir);
    db.exec('CREATE TABLE app_modules (module_id VARCHAR(100) NOT NULL PRIMARY KEY, seeded_at VARCHAR(30) NOT NULL)');
    db.prepare('INSERT INTO app_modules VALUES (?, ?)').run('sample-deals', '2026-10-27');
    db.prepare("INSERT INTO layouts (module_id, scope, name, layout, changed_by, changed_on, position) VALUES ('m', 'shared', 'L', '{}', 'u', 'd', 0)").run();
    const first = specs()[0];
    db.prepare(`INSERT INTO "${first.name}" ("${first.primaryKey[0]}") VALUES ('X1')`).run();

    const oldFile = genFile(dir, 3);
    const old = readFileSync(path.join(dir, oldFile), 'utf8');
    applyPlan(dir, planMigrations(dir, none, withColumn(specs())));
    const dropped = rebuildLocal(db, [{ version: versionOf(oldFile), sql: old }], dir);

    expect(dropped).toContain(first.name);
    expect(columnsOf(db, first.name)).toContain('extra_note');
    expect(db.prepare(`SELECT COUNT(*) AS n FROM "${first.name}"`).get()).toEqual({ n: 0 });
    expect(db.prepare("SELECT version FROM schema_migrations WHERE version LIKE '0003%'").all()).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM app_modules').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM layouts').get()).toEqual({ n: 1 });
    db.close();
  });

  it('undoes an ADD COLUMN migration, and skips the app_modules step when that table is missing', () => {
    const dir = schemaDir();
    applyPlan(dir, planMigrations(dir, none, specs()));
    const db = new DatabaseSync(':memory:');
    const frozen3 = (f: string) => GEN(3).test(f);
    applyPlan(dir, planMigrations(dir, frozen3, withColumn(specs())));
    migrate(db, dir);
    const table = specs()[0].name;
    expect(columnsOf(db, table)).toContain('extra_note');
    const fourth = genFile(dir, 4);
    const old = readFileSync(path.join(dir, fourth), 'utf8');
    applyPlan(dir, { remove: [fourth], warnings: [], refusals: [], upToDate: false });
    expect(rebuildLocal(db, [{ version: versionOf(fourth), sql: old }], dir)).toEqual([]);
    expect(columnsOf(db, table)).not.toContain('extra_note');
    db.close();
  });
});
