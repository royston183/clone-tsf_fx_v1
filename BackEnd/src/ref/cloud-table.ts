// A RefTable over a middleware cloud resource (data/<resource>), ported from the reference gateway's cloud/table.ts:
// column casing (lower-case, or upper for some resources), paged reads, SAP DATS / TIMS spoken as ISO on the wire, and
// the DDIC initial values a partial create needs. Rows are read back after every write.
import { callMiddleware, type RefDeps } from './middleware-proxy';
import { checkedFields, checkedKey, DdicInputError, TableError, type DdicColumn, type DdicRow, type RefTable } from './ddic';

const PAGE = 500;
const dateColumn = (name: string) => name.endsWith('_DATE') || name === 'ZDDATE';
const timeColumn = (name: string) => name.endsWith('_TIME');

export function cloudTable(deps: RefDeps, resource: string, columns: readonly DdicColumn[], columnCase: 'lower' | 'upper' = 'lower'): RefTable {
  const wireName = (name: string) => (columnCase === 'upper' ? name : name.toLowerCase());
  const keys = columns.filter(c => c.key);
  const byName = new Map(columns.map(c => [c.name, c]));

  async function call(method: string, query = '', body?: unknown): Promise<Record<string, unknown>> {
    const result = await callMiddleware(deps, method, `data/${resource}`, query, body === undefined ? undefined : JSON.stringify(body), { contentType: 'application/json' });
    let data: Record<string, unknown>;
    try { data = JSON.parse(result.body) as Record<string, unknown>; } catch { throw new TableError(502, `The cloud resource ${resource} returned an invalid response.`); }
    if (result.status >= 400 || data?.['ok'] === false) {
      const error = data?.['error'] as { message?: string | { value?: string } } | undefined;
      const message = typeof error?.message === 'string' ? error.message : error?.message?.value;
      throw new TableError(result.status >= 400 ? result.status : 502, message || `Cloud request for ${resource} failed.`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TableError(502, `The cloud resource ${resource} returned an invalid response.`);
    return data;
  }

  const wireKey = (key: Record<string, string>): Record<string, string> => {
    const k = checkedKey(columns, key);
    return Object.fromEntries(keys.map(c => [wireName(c.name), k[c.name]]));
  };

  // The middleware's codecs take ISO dates / times; a blank time is NULL to them, so it is midnight.
  const toWire = (row: DdicRow): Record<string, string | number> => Object.fromEntries(Object.entries(row).map(([name, v]) => {
    let value = v;
    if (timeColumn(name) && value === '') value = '000000';
    if (typeof value === 'string' && dateColumn(name) && /^\d{8}$/.test(value) && value !== '00000000') value = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    if (typeof value === 'string' && timeColumn(name) && /^\d{6}$/.test(value)) value = `${value.slice(0, 2)}:${value.slice(2, 4)}:${value.slice(4, 6)}`;
    return [wireName(name), value];
  }));

  const fromWire = (raw: Record<string, unknown>): DdicRow => {
    const row: DdicRow = {};
    for (const c of columns) {
      const value = raw[wireName(c.name)] ?? '';
      if (c.kind === 'number') {
        const num = Number(value);
        if (!Number.isFinite(num)) throw new TableError(502, `Invalid ${c.name} in cloud resource ${resource}.`);
        row[c.name] = num;
      } else {
        let text = String(value);
        if (dateColumn(c.name)) text = text.replace(/-/g, '');
        if (timeColumn(c.name)) text = text.replace(/:/g, '');
        row[c.name] = text;
      }
    }
    return row;
  };

  async function read(filter: Record<string, string>): Promise<DdicRow[]> {
    const rows: DdicRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const query = new URLSearchParams({ ...filter, limit: String(PAGE), offset: String(offset), sort: keys.map(c => wireName(c.name)).join(',') });
      const data = await call('GET', query.toString());
      if (!Array.isArray(data['rows'])) throw new TableError(502, `Missing rows in cloud resource ${resource}.`);
      rows.push(...(data['rows'] as Record<string, unknown>[]).map(fromWire));
      if (data['rows'].length < PAGE) return rows;
    }
  }

  return {
    async list(filter) {
      if (filter && !byName.has(filter.column)) throw new DdicInputError(`Unknown field: ${filter.column}.`);
      return read(filter ? { [wireName(filter.column)]: filter.value } : {});
    },
    async get(key) { return (await read(wireKey(key)))[0]; },
    async upsert(key, body, existing) {
      const wk = wireKey(key);
      const fields = checkedFields(columns, body);
      if (existing) await call('PATCH', '', { key: wk, changes: toWire(fields) });
      else {
        // The imported cloud columns are NOT NULL: a partial create needs the DDIC initial values.
        const initial: DdicRow = Object.fromEntries(columns.filter(c => !c.key).map(c => [c.name, c.kind === 'number' ? 0 : '']));
        await call('POST', '', { data: toWire({ ...initial, ...key, ...fields }) });
      }
      const saved = (await read(wk))[0];
      if (!saved) throw new TableError(existing ? 409 : 502, 'The cloud write could not be read back. Reload before retrying.');
      return saved;
    },
    async remove(key) {
      const wk = wireKey(key);
      if (!(await read(wk)).length) return false;
      const result = await call('DELETE', '', { key: wk });
      return result['affectedRows'] !== 0;
    }
  };
}
