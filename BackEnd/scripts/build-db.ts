// Builds DB/app.db (or DB_PATH) from the migrations in DB/schema, then, with --seed, runs DB/seed/*.sql in name order.
// Safe to run again: applied migrations are skipped (table schema_migrations).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../src/db';
import { appRoot, dbPath, loadEnvFile } from '../src/platform-node';

const root = appRoot();
loadEnvFile(root);
const file = dbPath(root);
// openDb applies every migration not applied yet.
const db = openDb(file, path.join(root, 'DB', 'schema'));
const versions = (db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[]).map(r => r.version);
process.stdout.write(`${file}: schema up to date (${versions.join(', ')})\n`);
if (process.argv.includes('--seed')) {
  const dir = path.join(root, 'DB', 'seed');
  for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(dir, f), 'utf8'));
    process.stdout.write(`seeded ${f}\n`);
  }
}
db.close();
