// The application's SQLite database, DB/app.db, built from the numbered migrations in DB/schema/*.sql. It uses Node's
// built-in SQLite (node:sqlite, Node 22.13+): no native package to compile, nothing to install beside the build.
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Driver, SqlValue } from './tables/driver';

export type Db = DatabaseSync;

/** Runs `work` in one transaction: all of it or nothing. */
export function inTransaction<T>(db: Db, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * The Driver over this one synchronous connection. A promise-chain lock lets one statement or transaction run at a
 * time, so another request cannot slip into a transaction whose body awaits; `tx` inside a transaction skips the lock.
 */
export function sqliteDriver(db: Db): Driver {
  let tail: Promise<unknown> = Promise.resolve();
  const inside = new AsyncLocalStorage<true>();
  const guard = (): void => { if (inside.getStore()) throw new Error('Inside a transaction, use the tx driver it hands you.'); };
  const locked = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job);
    tail = result.catch(() => undefined);
    return result;
  };
  // Integers come back as bigint, so a 16–19 digit BIGINT reads exactly (toRow turns it into its digits).
  const rows = (sql: string, params: SqlValue[]) => { const s = db.prepare(sql); s.setReadBigInts(true); return s.all(...params) as Record<string, unknown>[]; };
  const exec = (sql: string, params: SqlValue[]) => { db.prepare(sql).run(...params); };
  const inner: Driver = {
    engine: 'sqlite',
    all: async (sql, params = []) => rows(sql, params),
    run: async (sql, params = []) => exec(sql, params),
    transaction: work => work(inner)
  };
  return {
    engine: 'sqlite',
    all: async (sql, params = []) => { guard(); return locked(async () => rows(sql, params)); },
    run: async (sql, params = []) => { guard(); return locked(async () => exec(sql, params)); },
    transaction: async <T>(work: (tx: Driver) => Promise<T>) => {
      guard();
      return locked(async () => {
        db.exec('BEGIN');
        try {
          const result = await inside.run(true, () => work(inner));
          db.exec('COMMIT');
          return result;
        } catch (error) {
          // SQLite may have rolled back by itself (INSERT OR ROLLBACK); a failing ROLLBACK must not hide the real error.
          if (db.isTransaction) { try { db.exec('ROLLBACK'); } catch { /* keep the original error */ } }
          throw error;
        }
      });
    }
  };
}

/** The migrations in name order (0001_init.sql, 0002_…). */
export function migrations(schemaDir: string): { version: string; sql: string }[] {
  return readdirSync(schemaDir).filter(f => /^\d{4}_[\w-]+\.sql$/.test(f)).sort()
    .map(f => ({ version: f.replace(/\.sql$/, ''), sql: readFileSync(path.join(schemaDir, f), 'utf8') }));
}

/** Applies every migration not applied yet, each in its own transaction; returns the versions it applied. */
export function migrate(db: Db, schemaDir: string): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT NOT NULL PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]).map(r => r.version));
  const applied: string[] = [];
  for (const m of migrations(schemaDir)) {
    if (done.has(m.version)) continue;
    inTransaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, new Date().toISOString());
    });
    applied.push(m.version);
  }
  return applied;
}

/**
 * Opens (and creates, when missing) the database and brings its schema up to date. ':memory:' for tests. WAL by
 * default; 'DELETE' (the rollback journal) where WAL cannot work, such as a network share (the Function App).
 */
export function openDb(file: string, schemaDir: string, journal: 'WAL' | 'DELETE' = 'WAL'): Db {
  if (file !== ':memory:' && !existsSync(path.dirname(file))) mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec(`PRAGMA journal_mode = ${journal}`);
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db, schemaDir);
  return db;
}
