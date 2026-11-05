// Read only a SQLite database's structure for the provisioner. No row query is ever made.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class SchemaError extends Error {}

export function extractChecks(sql = '') {
  const checks = [];
  for (let i = 0; i < sql.length;) {
    const char = sql[i];
    if (`'\"\``.includes(char)) {
      let end = sql.indexOf(char, i + 1);
      while (end >= 0 && sql[end + 1] === char) end = sql.indexOf(char, end + 2);
      i = end < 0 ? sql.length : end + 1;
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (sql.slice(i, i + 5).toUpperCase() === 'CHECK' && (i === 0 || !/[A-Za-z0-9_]/.test(sql[i - 1]))) {
      let start = i + 5;
      while (/\s/.test(sql[start] || '')) start += 1;
      if (sql[start] !== '(') { i = start; continue; }
      let depth = 0;
      let end = start;
      for (; end < sql.length; end += 1) {
        if (sql[end] === "'") {
          const quote = sql.indexOf("'", end + 1);
          end = quote < 0 ? sql.length : quote;
        } else if (sql[end] === '(') depth += 1;
        else if (sql[end] === ')' && --depth === 0) break;
      }
      checks.push(sql.slice(start + 1, end).trim());
      i = end + 1;
    } else i += 1;
  }
  return checks;
}

const quoteIdentifier = value => `"${String(value).replaceAll('"', '""')}"`;

function readTable(db, name, sql, warnings) {
  const columns = db.prepare(`PRAGMA table_xinfo(${quoteIdentifier(name)})`).all()
    .filter(column => {
      if (![2, 3].includes(Number(column.hidden))) return true;
      warnings.push(`${name}.${column.name} is a generated column and is not migrated`);
      return false;
    })
    .map(column => ({ name: column.name, type: column.type || '', notnull: Boolean(column.notnull), default: column.dflt_value, pk: Number(column.pk) }));
  const primary = columns.filter(column => column.pk);
  const explicitAuto = /\bAUTOINCREMENT\b/i.test(sql);
  for (const column of columns) {
    column.autoincrement = Boolean(primary.length === 1 && column.pk && column.type.trim().toUpperCase() === 'INTEGER'
      && (!/WITHOUT ROWID/i.test(sql) || explicitAuto));
  }

  const groups = new Map();
  for (const row of db.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`).all()) {
    if (!groups.has(row.id)) groups.set(row.id, { columns: [], ref_table: row.table, ref_columns: [], on_update: row.on_update, on_delete: row.on_delete });
    const group = groups.get(row.id);
    group.columns.push(row.from);
    group.ref_columns.push(row.to);
  }
  const foreignKeys = [...groups.values()].map(key => ({ ...key, ref_columns: key.ref_columns.some(value => value == null) ? null : key.ref_columns }));
  const uniques = [];
  const indexes = [];
  for (const row of db.prepare(`PRAGMA index_list(${quoteIdentifier(name)})`).all()) {
    if (row.origin === 'pk') continue;
    const names = db.prepare(`PRAGMA index_info(${quoteIdentifier(row.name)})`).all().map(info => info.name);
    if (row.partial) { warnings.push(`${name}.${row.name} is a partial index and is not migrated`); continue; }
    if (names.some(value => value == null)) { warnings.push(`${name}.${row.name} is an expression index and is not migrated`); continue; }
    if (row.origin === 'u') uniques.push({ columns: names });
    else indexes.push({ name: row.name, columns: names, unique: Boolean(row.unique) });
  }
  return { name, columns, foreign_keys: foreignKeys, uniques, indexes, checks: extractChecks(sql) };
}

export function introspect(databasePath) {
  const file = path.resolve(databasePath);
  if (!existsSync(file)) throw new SchemaError(`Database file not found: ${file}`);
  let db;
  try { db = new DatabaseSync(file, { readOnly: true }); }
  catch (error) { throw new SchemaError(`${path.basename(file)} is not a readable SQLite database: ${error.message}`); }
  try {
    const rows = db.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY rowid").all();
    const warnings = [];
    for (const row of rows) if (['view', 'trigger'].includes(row.type)) warnings.push(`${row.type} ${row.name} is not migrated`);
    const tables = rows.filter(row => row.type === 'table' && !String(row.sql || '').trimStart().toUpperCase().startsWith('CREATE VIRTUAL'))
      .map(row => readTable(db, row.name, row.sql || '', warnings));
    const byName = new Map(tables.map(table => [table.name, table]));
    for (const table of tables) {
      for (const foreign of table.foreign_keys) {
        if (foreign.ref_columns == null) {
          foreign.ref_columns = (byName.get(foreign.ref_table)?.columns || []).filter(column => column.pk)
            .sort((a, b) => a.pk - b.pk).map(column => column.name);
        }
      }
      table.foreign_keys = table.foreign_keys.filter(foreign => byName.has(foreign.ref_table));
    }
    if (!tables.length) throw new SchemaError('The database has no tables');
    return { tables, warnings };
  } catch (error) {
    if (error instanceof SchemaError) throw error;
    throw new SchemaError(`${path.basename(file)} is not a readable SQLite database: ${error.message}`);
  } finally { db.close(); }
}
