// The tables the application's own data needs, worked out from the module definitions (spec 2026-10-27-app-data-tables §2–4).
import { createHash } from 'node:crypto';
import { typeOf, valueFields, type AnyField } from '@/lib/fields';
import type { ListDef } from '@/lib/list/types';
import { isTableModule } from '@/modules/registry';
import { sourceOf, type ModuleData } from '@/modules/server-registry';
import { moduleTables } from '@/modules/tables';

export type ValueKind = 'string' | 'integer' | 'decimal' | 'date';
export interface ColumnSpec { name: string; type: string; kind: ValueKind; scale?: number; notNull: boolean; nocase: boolean }
export interface IndexSpec { name: string; columns: string[] }
export interface TableSpec { name: string; moduleId: string; entity: string; columns: ColumnSpec[]; primaryKey: string[]; indexes: IndexSpec[]; etag: boolean }
export interface WantedSchema { tables: TableSpec[]; warnings: string[] }

const MAX_NAME = 64;
const MAX_DIGITS = 15;
// MySQL/InnoDB with utf8mb4: an index key holds at most 3072 bytes, a row's VARCHAR columns at most about 65535.
const MAX_KEY_BYTES = 3072;
const MAX_INDEX_CHARS = 768;
const MAX_ROW_TEXT_BYTES = 65000;
/** The least length of a column for a choice from fixed options. */
const OPTION_MIN = 32;
const STAMP_TYPES: [string, string][] = [['VARCHAR(12)', 'user'], ['CHAR(8)', 'date'], ['CHAR(6)', 'time']];

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();

/** `<module>__<entity>` in lower snake case. */
export const tableName = (moduleId: string, entity: string): string => `${snake(moduleId)}__${snake(entity)}`;

const tooLong = (what: string, name: string) => new Error(`${what} "${name}" is longer than ${MAX_NAME} characters; shorten the id in the module definition.`);

/** The characters of a VARCHAR(n) or CHAR(n) column; 0 for any other type. */
export const textLength = (type: string): number => Number(/^(?:VAR)?CHAR\((\d+)\)$/.exec(type)?.[1] ?? 0);
/** The bytes a column takes in a MySQL index key (utf8mb4: 4 per character). */
function keyBytes(type: string): number {
  if (textLength(type)) return 4 * textLength(type);
  return type === 'BIGINT' ? 8 : type.startsWith('DECIMAL') ? 16 : type === 'DATE' ? 3 : 0;
}

function indexName(table: string, columns: string[]): string {
  const long = `ix_${table}__${columns.join('_')}`;
  return long.length <= MAX_NAME ? long : `ix_${createHash('sha1').update(long).digest('hex').slice(0, 12)}`;
}

/** A column for a field that has a definition. */
function typed(d: AnyField, isKey: boolean, table: string, warnings: string[]): Pick<ColumnSpec, 'type' | 'kind' | 'scale'> {
  const t = typeOf(d);
  // One choice from fixed options (a status) is as long as its longest value, and indexed; at least OPTION_MIN, since the
  // deployed database never widens a column once pushed and a longer option may be added later.
  const single = t === 'select' || t === 'segmented';
  const fixed = single && Array.isArray(d.options) && d.options.length ? Math.max(OPTION_MIN, ...d.options.map(o => String(o.value).length)) : undefined;
  const text = (): Pick<ColumnSpec, 'type' | 'kind'> => ({ type: d.max ? `VARCHAR(${d.max})` : fixed ? `VARCHAR(${fixed})` : isKey ? 'VARCHAR(255)' : 'TEXT', kind: 'string' });
  switch (t) {
    case 'integer': return d.keepZeros ? text() : { type: 'BIGINT', kind: 'integer' };
    case 'amount':
    case 'decimal': {
      const scale = d.scale ?? 2, precision = d.precision ?? MAX_DIGITS;
      if (precision > MAX_DIGITS) warnings.push(`${table}.${d.field}: precision ${precision} is more than ${MAX_DIGITS} digits; the column is capped at ${MAX_DIGITS}.`);
      return { type: `DECIMAL(${Math.min(precision, MAX_DIGITS)},${scale})`, kind: 'decimal', scale };
    }
    case 'date': return { type: 'DATE', kind: 'date' };
    case 'flag':
    case 'toggle': return { type: 'CHAR(1)', kind: 'string' };
    default: return text();
  }
}

/** The list of the table, when it is one a person filters and sorts (an object's list, a large table tab). */
function listOf(entry: ModuleData, entity: string): ListDef | undefined {
  const def = entry.def;
  if (def.kind === 'object') return entity === def.list.entity ? def.list : undefined;
  if (isTableModule(def)) return def.tabs.find(t => t.id === entity && t.large)?.list;
  return undefined;
}

/** The tables of one module: columns from its fields, keys, indexes, and the ETag column of an object's header. */
export function moduleSchema(id: string, entry: ModuleData, warnings: string[] = []): TableSpec[] {
  const def = entry.def;
  const infos = moduleTables(def);
  const stamps = isTableModule(def) ? def.stamps : undefined;
  const headerEntity = def.kind === 'object' ? def.list.entity : undefined;
  const headerKeys = headerEntity ? infos[headerEntity].keys : [];
  const headerDefs = headerEntity ? valueFields(infos[headerEntity].defs) : [];
  const out: TableSpec[] = [];
  for (const [entity, info] of Object.entries(infos)) {
    const name = tableName(id, entity);
    if (name.length > MAX_NAME) throw tooLong('Table name', name);
    const own = valueFields(info.defs);
    const isHeader = entity === headerEntity;
    const columns: ColumnSpec[] = info.fields.map(field => {
      if (field.length > MAX_NAME) throw tooLong('Column name', field);
      const isKey = info.keys.includes(field);
      const d = own.find(x => x.field === field) ?? (!isHeader && headerKeys.includes(field) ? headerDefs.find(x => x.field === field) : undefined);
      const stamp = stamps?.indexOf(field) ?? -1;
      let spec: Pick<ColumnSpec, 'type' | 'kind' | 'scale'>;
      if (d) spec = typed(d, isKey, name, warnings);
      else if (stamp >= 0) spec = { type: STAMP_TYPES[stamp % 3][0], kind: 'string' };
      else {
        warnings.push(`${name}.${field} has no field definition; it is stored as ${isKey ? 'VARCHAR(255)' : 'TEXT'}. Give it a type in the module definition.`);
        spec = { type: isKey ? 'VARCHAR(255)' : 'TEXT', kind: 'string' };
      }
      return { name: field, ...spec, notNull: isKey, nocase: isKey && spec.kind === 'string' };
    });
    if (isHeader) {
      if (columns.some(c => c.name === 'etag')) throw new Error(`${name} has a field named "etag"; the table keeps the row's ETag in a column of that name. Rename the field.`);
      columns.push({ name: 'etag', type: 'VARCHAR(64)', kind: 'string', notNull: false, nocase: false });
    }
    const has = (f: string) => columns.some(c => c.name === f);
    const typeOfColumn = (f: string) => columns.find(c => c.name === f)?.type ?? '';
    const bytesOf = (cols: string[]) => cols.reduce((n, f) => n + keyBytes(typeOfColumn(f)), 0);
    const keyTotal = bytesOf(info.keys);
    if (keyTotal > MAX_KEY_BYTES) throw new Error(`${name}: the key is too long for the deployed database (${keyTotal} bytes, at most ${MAX_KEY_BYTES}); give its text key fields a smaller max.`);
    if (columns.reduce((n, c) => n + 4 * textLength(c.type), 0) > MAX_ROW_TEXT_BYTES) {
      throw new Error(`${name}: its text fields are too long together for the deployed database; remove the max of long text fields (they are then stored as TEXT).`);
    }
    const list = listOf(entry, entity);
    const wanted = list ? [...new Set([...(list.filters ?? []), ...(list.sort ?? [])])].filter(f => f !== info.keys[0] && has(f)).map(f => [f]) : [];
    // MySQL cannot index a TEXT column without a key length, nor a key longer than 3072 bytes.
    const indexable = wanted.filter(([f]) => {
      const type = typeOfColumn(f);
      if (type === 'TEXT') warnings.push(`${name}.${f} is TEXT (no max length), so it gets no index; give the field a max to index it.`);
      else if (textLength(type) > MAX_INDEX_CHARS) warnings.push(`${name}.${f} is longer than ${MAX_INDEX_CHARS} characters, so it gets no index; give the field a max of ${MAX_INDEX_CHARS} or less to index it.`);
      else return true;
      return false;
    });
    if (def.kind === 'object' && !isHeader) {
      const missing = headerKeys.find(k => !has(k));
      if (missing) throw new Error(`${name} has no column "${missing}", a key of its header table; add it to the items keys.`);
      if (bytesOf(headerKeys) <= MAX_KEY_BYTES) indexable.push(headerKeys);
      else warnings.push(`${name}: its header key (${headerKeys.join(', ')}) is longer than ${MAX_KEY_BYTES} bytes, so it gets no index; give the header key fields a smaller max.`);
    }
    out.push({
      name, moduleId: id, entity, columns, primaryKey: info.keys, etag: isHeader,
      indexes: indexable.map(cols => ({ name: indexName(name, cols), columns: cols }))
    });
  }
  return out;
}

/**
 * Every table of the modules that keep their data in the application: the shipped ones, or the dev-only (Gallery) ones. A
 * reference example (registered back for the template's tests) is never shipped; its tables are made like a dev-only one's.
 */
export function wantedSchema(modules: Record<string, ModuleData>, which: 'shipped' | 'devOnly'): WantedSchema {
  const warnings: string[] = [];
  const tables = Object.entries(modules)
    .filter(([, m]) => sourceOf(m) === 'app' && Boolean(m.def.devOnly || m.reference) === (which === 'devOnly'))
    .flatMap(([id, m]) => moduleSchema(id, m, warnings));
  return { tables, warnings };
}
