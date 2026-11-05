// A RefTable over the BackEnd's database through its Driver (SQLite and MySQL): lower-case column names, bound
// parameters only (names reach SQL from the fixed column list, values never). No upsert syntax, as engines differ: a save
// is an UPDATE of the row or an INSERT, inside one transaction.
import { checkedFields, checkedKey, DdicInputError, type DdicColumn, type DdicRow, type RefTable } from './ddic';
import type { Driver, SqlValue } from '../tables/driver';

export function sqlTable(driver: () => Driver, table: string, columns: readonly DdicColumn[]): RefTable {
  const keys = columns.filter(c => c.key);
  const byName = new Map(columns.map(c => [c.name, c]));
  const lower = (name: string) => name.toLowerCase();
  const select = `SELECT ${columns.map(c => lower(c.name)).join(', ')} FROM ${table}`;
  const order = ` ORDER BY ${keys.map(k => lower(k.name)).join(', ')}`;
  const where = (names: string[]) => ` WHERE ${names.map(x => `${lower(x)} = ?`).join(' AND ')}`;
  const keyWhere = where(keys.map(c => c.name));
  const toRow = (raw: Record<string, unknown>): DdicRow => Object.fromEntries(columns.map(c => {
    const v = raw[lower(c.name)];
    return [c.name, c.kind === 'number' ? Number(v ?? 0) : String(v ?? '')];
  }));
  const keyValues = (key: Record<string, string>): SqlValue[] => { const k = checkedKey(columns, key); return keys.map(c => k[c.name]); };

  const read = async (d: Driver, key: Record<string, string>): Promise<DdicRow | undefined> => {
    const rows = await d.all(select + keyWhere, keyValues(key));
    return rows[0] ? toRow(rows[0]) : undefined;
  };

  return {
    async list(filter) {
      if (!filter) return (await driver().all(select + order)).map(toRow);
      if (!byName.has(filter.column)) throw new DdicInputError(`Unknown field: ${filter.column}.`);
      return (await driver().all(select + where([filter.column]) + order, [filter.value])).map(toRow);
    },
    get: key => read(driver(), key),
    async upsert(key, body) {
      const values = keyValues(key);
      const fields = checkedFields(columns, body);
      const names = Object.keys(fields);
      return driver().transaction(async tx => {
        const present = (await tx.all(`SELECT 1 AS one FROM ${table}${keyWhere}`, values)).length > 0;
        if (present) {
          if (names.length) await tx.run(`UPDATE ${table} SET ${names.map(x => `${lower(x)} = ?`).join(', ')}${keyWhere}`, [...names.map(x => fields[x]), ...values]);
        } else {
          const all = [...keys.map(c => c.name), ...names];
          await tx.run(`INSERT INTO ${table} (${all.map(lower).join(', ')}) VALUES (${all.map(() => '?').join(', ')})`, [...values, ...names.map(x => fields[x])]);
        }
        return (await read(tx, key))!;
      });
    },
    async remove(key) {
      const values = keyValues(key);
      return driver().transaction(async tx => {
        if (!(await tx.all(`SELECT 1 AS one FROM ${table}${keyWhere}`, values)).length) return false;
        await tx.run(`DELETE FROM ${table}${keyWhere}`, values);
        return true;
      });
    }
  };
}
