// Shared shapes of the reference gateway's table routes (ported from TSF - FX Application, packages/gateway): a SAP table
// as columns (SAP's field names, which is also what the API speaks), a table over some store, and the errors that map to statuses.

/** One column of a SAP table. `key` marks a primary-key column other than the client. */
export interface DdicColumn { name: string; kind: 'text' | 'number'; max: number; key?: true }
export type DdicRow = Record<string, string | number>;

/** A request the table cannot take (400). */
export class DdicInputError extends Error {}
/** A failure with the status the caller should see (middleware answers, bad responses). */
export class TableError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** What a route needs from a table, whether its rows live in the middleware's cloud tables or in the BackEnd's database. */
export interface RefTable {
  list(filter?: { column: string; value: string }): Promise<DdicRow[]>;
  get(key: Record<string, string>): Promise<DdicRow | undefined>;
  upsert(key: Record<string, string>, body: Record<string, unknown>, existing: DdicRow | undefined): Promise<DdicRow>;
  remove(key: Record<string, string>): Promise<boolean>;
}

/** The key values, checked against the key columns (required, within their length), in column order. */
export function checkedKey(columns: readonly DdicColumn[], key: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns.filter(x => x.key)) {
    const value = key[c.name];
    if (typeof value !== 'string' || !value.trim() || value.length > c.max) throw new DdicInputError(`${c.name} is required, at most ${c.max} characters.`);
    out[c.name] = value;
  }
  return out;
}

/** The body's fields, checked against the columns: no key or unknown names, numbers as numbers, text within its length (null clears). */
export function checkedFields(columns: readonly DdicColumn[], body: Record<string, unknown>): DdicRow {
  const byName = new Map(columns.map(c => [c.name, c]));
  const out: DdicRow = {};
  for (const [name, value] of Object.entries(body)) {
    const column = byName.get(name);
    if (!column || column.key) throw new DdicInputError(`Unknown or read-only field: ${name}.`);
    if (column.kind === 'number') {
      const n = typeof value === 'string' && value.trim() ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new DdicInputError(`${name} must be a number.`);
      out[name] = n;
    } else {
      if (value === null || value === undefined) { out[name] = ''; continue; }
      if (typeof value !== 'string' || value.length > column.max) throw new DdicInputError(`${name} must be a string of at most ${column.max} characters.`);
      out[name] = value;
    }
  }
  return out;
}
