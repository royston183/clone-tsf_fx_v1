// Brings DB/schema to the module definitions: writes the generated migration of the module tables and rebuilds the local
// tables of a changed, unpushed one. --check only verifies. FS Sprint reads these output lines: keep their prefixes.
import path from 'node:path';
import { appRoot, loadEnvFile } from '../src/platform-node';
import { frozenMigrations, generate, planMigrations } from '../src/schema/migrations';
import { wantedSchema } from '../src/schema/wanted';
import { SERVER_MODULES } from '@/modules/server-registry';

const out = (s: string) => process.stdout.write(`${s}\n`);

function main(): number {
  const root = appRoot();
  loadEnvFile(root);
  const wanted = wantedSchema(SERVER_MODULES, 'shipped');
  for (const w of wanted.warnings) out(`Schema warning: ${w}`);
  if (!process.argv.includes('--check')) {
    for (const line of generate(root, wanted.tables).lines) out(line);
    return 0;
  }
  const plan = planMigrations(path.join(root, 'DB', 'schema'), frozenMigrations(root), wanted.tables);
  for (const w of plan.warnings) out(`Schema warning: ${w}`);
  for (const r of plan.refusals) out(`Schema: ${r}`);
  if (plan.refusals.length) return 1;
  if (plan.rename) {
    out(`Schema: DB/schema/${plan.rename.from} needs the next number after a teammate's migration: run npm run gen-schema (or test the app) and commit the result.`);
    return 1;
  }
  if (!plan.upToDate) {
    out('Schema: DB/schema is out of date with the modules: run npm run gen-schema and commit the new migration.');
    return 1;
  }
  out('Schema: up to date.');
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`Schema: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
