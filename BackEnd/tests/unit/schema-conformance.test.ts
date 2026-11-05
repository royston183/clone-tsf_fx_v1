import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { SERVER_MODULES } from '@/modules/server-registry';
import { migrate } from '../../src/db';
import { appRoot } from '../../src/platform-node';
import { planMigrations } from '../../src/schema/migrations';
import { wantedSchema } from '../../src/schema/wanted';

const SCHEMA_DIR = path.join(appRoot(), 'DB', 'schema');
const wanted = wantedSchema(SERVER_MODULES, 'shipped').tables;

describe('DB/schema conforms to the module definitions', () => {
  it('has every wanted table with its primary key', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, SCHEMA_DIR);
    for (const t of wanted) {
      const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all() as { name: string; pk: number }[];
      expect(cols.length, t.name).toBeGreaterThan(0);
      expect(cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name), t.name).toEqual(t.primaryKey);
    }
    db.close();
  });

  it('needs no new migration', () => {
    expect(planMigrations(SCHEMA_DIR, () => true, wanted).upToDate).toBe(true);
  });
});
