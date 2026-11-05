// The core's platform on Node: process.env (plus .env.local), local SQLite or provisioned MySQL. The BackEnd keeps the
// application's own data (`app` modules) and calls the REST data services of `rest` modules; it never calls SAP.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Platform } from '@core/platform';
import { HttpError } from '@/lib/errors';
import { SERVER_MODULES, keptByBackend, sourceOf } from '@/modules/server-registry';
import { openDb, sqliteDriver, type Db } from './db';
import { mysqlDriver, mysqlPool } from './mysql';
import { createIndexSql, createTableSql } from './schema/ddl';
import { moduleSchema, wantedSchema, type TableSpec } from './schema/wanted';
import type { Driver } from './tables/driver';
import { driverLayouts } from './tables/layouts';
import { setRefDriver } from './ref/driver';
import { restBackend, restEndpoint } from './rest/rest-backend';
import { tableBackend } from './tables/table-backend';

/** The application root: the first folder up from here that holds DB/schema (works from src/ and from dist/). */
export function appRoot(from = path.dirname(fileURLToPath(import.meta.url))): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'DB', 'schema'))) return dir;
    if (path.dirname(dir) === dir) throw new Error('Cannot find the application root (the folder with DB/schema).');
  }
}

/**
 * Reads .env.local from the application root once. A variable already in the process environment, even an empty
 * one, is never replaced (FS Sprint and the e2e tests set their values that way).
 */
export function loadEnvFile(root: string): void {
  const file = path.join(root, '.env.local');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** DB_PATH (':memory:' keeps nothing, for e2e runs), or DB/app.db in the application root. */
export function dbPath(root: string): string {
  const set = process.env.DB_PATH?.trim();
  if (set === ':memory:') return set;
  return set ? path.resolve(set) : path.join(root, 'DB', 'app.db');
}

export const NOT_KEPT = "This application's data is not kept by the BackEnd.";

/**
 * The Node platform over a database: the data of an `app` module in its generated tables (`<module>__<table>`), a `rest`
 * module's in its REST data service (rest/rest-backend.ts), and
 * the saved layouts of any module with a source (table layouts). Every other module (`sap`, read by the browser through
 * the relay, or still on its sample data in the page) is 404, and so is a Gallery sample where `devTables` is off
 * (MySQL: a sample is never deployed).
 */
export function storesPlatform(o: { driver: Driver; devTables: boolean }): Platform {
  setRefDriver(o.driver); // the /api/ref/localdb routes keep their own table in the same database
  const layouts = driverLayouts(o.driver);
  return {
    env: () => process.env,
    keeps: entry => keptByBackend(sourceOf(entry)),
    backend(id, entry) {
      // A `rest` module's data stays in its REST data service: read and written there on every call.
      if (sourceOf(entry) === 'rest' && entry.rest) return restBackend(id, entry, restEndpoint(entry.rest, process.env));
      if (sourceOf(entry) !== 'app' || (entry.def.devOnly && !o.devTables)) throw new HttpError(404, NOT_KEPT);
      return tableBackend(id, entry, o.driver, moduleSchema(id, entry));
    },
    layouts(id, entry) {
      if (!sourceOf(entry)) throw new HttpError(404, NOT_KEPT);
      return layouts(id);
    }
  };
}

/**
 * The platform on a SQLite database. The tables of the Gallery samples (dev-only `app` modules), which never get a
 * migration, are created here (IF NOT EXISTS) for the modules registered now; one registered later (a test) gets its
 * tables when its backend is first made.
 */
export function nodePlatform(db: Db): Platform {
  const made = new Set<string>();
  const create = (tables: TableSpec[]) => {
    for (const t of tables.filter(x => !made.has(x.name))) {
      db.exec(createTableSql(t, true) + t.indexes.map(ix => createIndexSql(t.name, ix, true)).join(''));
      made.add(t.name);
    }
  };
  create(wantedSchema(SERVER_MODULES, 'devOnly').tables);
  const base = storesPlatform({ driver: sqliteDriver(db), devTables: true });
  return {
    ...base,
    backend(id, entry) {
      if (sourceOf(entry) === 'app' && entry.def.devOnly) create(moduleSchema(id, entry));
      return base.backend(id, entry);
    }
  };
}

export function openAppDb(root: string): Db {
  return openDb(dbPath(root), path.join(root, 'DB', 'schema'));
}

/** Select the provisioned MySQL database in Azure, or the normal local SQLite database everywhere else. */
export async function runtimeNodePlatform(
  root: string,
  options: { sqliteFile?: string; sqliteJournal?: 'WAL' | 'DELETE' } = {}
): Promise<Platform> {
  const engine = process.env.DB_ENGINE?.trim().toLowerCase() || 'sqlite';
  if (engine === 'mysql') return storesPlatform({ driver: mysqlDriver(mysqlPool()), devTables: false });
  if (engine !== 'sqlite') throw new Error(`Unsupported DB_ENGINE "${engine}".`);
  const db = options.sqliteFile
    ? openDb(options.sqliteFile, path.join(root, 'DB', 'schema'), options.sqliteJournal || 'WAL')
    : openAppDb(root);
  return nodePlatform(db);
}
