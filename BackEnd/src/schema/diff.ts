// What the database has now, and what must change to reach the wanted tables (spec 2026-10-27-app-data-tables §3).
import type { Db } from '../db';
import { addColumnSql, createIndexSql, createTableSql } from './ddl';
import type { TableSpec } from './wanted';

export interface CurrentColumn { name: string; type: string; notNull: boolean; pk: number }
export interface CurrentTable { name: string; columns: CurrentColumn[]; indexes: string[][] }
export interface SchemaDiff { statements: string[]; warnings: string[]; refusals: string[] }

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The tables, columns and (non-primary-key) indexes now in the database. */
export function readSchema(db: Db): Map<string, CurrentTable> {
  const out = new Map<string, CurrentTable>();
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  for (const { name } of names) {
    const columns = (db.prepare(`PRAGMA table_info(${q(name)})`).all() as { name: string; type: string; notnull: number; pk: number }[])
      .map(c => ({ name: c.name, type: c.type, notNull: c.notnull === 1, pk: c.pk }));
    const indexes = (db.prepare(`PRAGMA index_list(${q(name)})`).all() as { name: string; origin: string }[])
      .filter(i => i.origin !== 'pk')
      .map(i => (db.prepare(`PRAGMA index_info(${q(i.name)})`).all() as { seqno: number; name: string }[]).sort((a, b) => a.seqno - b.seqno).map(c => c.name));
    out.set(name, { name, columns, indexes });
  }
  return out;
}

const norm = (t: string) => t.toUpperCase().replace(/\s+/g, '');
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const changed = (what: string, from: string, to: string) => `The definition of \`${what}\` changed from ${from} to ${to} after it was pushed; keep the old definition, or add a new field.`;

/** The statements that bring `current` to `wanted`, the things kept though no longer wanted, and the changes refused. */
export function diffSchema(current: Map<string, CurrentTable>, wanted: TableSpec[]): SchemaDiff {
  const d: SchemaDiff = { statements: [], warnings: [], refusals: [] };
  for (const t of wanted) {
    const cur = current.get(t.name);
    if (!cur) {
      // IF NOT EXISTS: a teammate's migration of the same number may create the same table; the next run adds what differs.
      d.statements.push(createTableSql(t, true), ...t.indexes.map(ix => createIndexSql(t.name, ix, true)));
      continue;
    }
    for (const c of t.columns) {
      const have = cur.columns.find(x => x.name === c.name);
      if (!have) d.statements.push(addColumnSql(t.name, c));
      else if (norm(have.type) !== norm(c.type)) d.refusals.push(changed(`${t.name}.${c.name}`, have.type, c.type));
    }
    for (const have of cur.columns) {
      if (!t.columns.some(c => c.name === have.name)) d.warnings.push(`\`${t.name}.${have.name}\` is no longer in the module definition; it is kept.`);
    }
    const curKey = cur.columns.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    if (!same(curKey, t.primaryKey)) d.refusals.push(changed(`${t.name} primary key`, `(${curKey.join(', ')})`, `(${t.primaryKey.join(', ')})`));
    for (const ix of t.indexes) {
      if (!cur.indexes.some(cols => same(cols, ix.columns))) d.statements.push(createIndexSql(t.name, ix, true));
    }
  }
  for (const name of current.keys()) {
    if (!wanted.some(t => t.name === name)) d.warnings.push(`\`${name}\` is no longer in the module definition; it is kept.`);
  }
  return d;
}
