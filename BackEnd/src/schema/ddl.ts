// SQL text for the tables the module definitions want: CREATE TABLE, ADD COLUMN, CREATE INDEX (spec 2026-10-27-app-data-tables §3).
import type { ColumnSpec, IndexSpec, TableSpec } from './wanted';

const q = (s: string) => `"${s}"`;
const list = (cols: string[]) => cols.map(q).join(', ');

function columnSql(c: ColumnSpec): string {
  return `${q(c.name)} ${c.type}${c.notNull ? ' NOT NULL' : ''}${c.nocase ? ' COLLATE NOCASE' : ''}`;
}

/** CREATE TABLE with its columns and PRIMARY KEY clause. */
export function createTableSql(t: TableSpec, ifNotExists = false): string {
  const parts = [...t.columns.map(columnSql), `PRIMARY KEY (${list(t.primaryKey)})`];
  return `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${q(t.name)} (\n  ${parts.join(',\n  ')}\n);\n`;
}

/** ADD COLUMN: always nullable, since existing rows have no value. */
export function addColumnSql(table: string, c: ColumnSpec): string {
  return `ALTER TABLE ${q(table)} ADD COLUMN ${q(c.name)} ${c.type}${c.nocase ? ' COLLATE NOCASE' : ''};\n`;
}

export function createIndexSql(table: string, ix: IndexSpec, ifNotExists = false): string {
  return `CREATE INDEX ${ifNotExists ? 'IF NOT EXISTS ' : ''}${q(ix.name)} ON ${q(table)} (${list(ix.columns)});\n`;
}
