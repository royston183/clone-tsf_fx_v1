import path from 'node:path';
import { loadConfig, type AppConfig } from '@core/server/config';
import { setPlatform } from '@core/platform';
import { resetModuleBackends } from '@core/server/module-service';
import { nodePlatform } from '../../src/platform-node';
import { openDb, type Db } from '../../src/db';

export const SCHEMA_DIR = path.resolve(__dirname, '../../../DB/schema');

/** A fresh in-memory database with the application's schema. */
export const memoryDb = (): Db => openDb(':memory:', SCHEMA_DIR);

let storeKey: string | undefined;
let current: Db | undefined;
/** Points the core at a fresh in-memory database and forgets every module's backend. */
export function freshStore(key = `store-${Math.random()}`): Db {
  const db = memoryDb();
  setPlatform(nodePlatform(db));
  resetModuleBackends();
  storeKey = key;
  current = db;
  return db;
}

/** The in-memory database the core uses now (the last freshStore()). */
export function currentDb(): Db {
  if (!current) throw new Error('No test database: call freshStore() first.');
  return current;
}

/**
 * A config for tests: the FrontEnd on localhost:3100. `DATA_DIR` names a store: a new value starts a fresh in-memory
 * database, the same value keeps using it.
 */
export function testConfig(env: Record<string, string | undefined> = {}): AppConfig {
  const { DATA_DIR, ...rest } = env;
  if (DATA_DIR !== undefined && DATA_DIR !== storeKey) freshStore(DATA_DIR);
  return loadConfig({ APP_ORIGINS: 'http://localhost:3100', NODE_ENV: process.env.NODE_ENV, ...rest });
}
