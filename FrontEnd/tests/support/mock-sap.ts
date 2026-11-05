// A small SAP Gateway stand-in, as the browser sees it through the SAP relay (which keeps SAP's session cookie per SAP
// user, so no cookie travels): Basic auth, sap-client, a CSRF token per SAP user, OData V4 reads with
// $filter/$orderby/$skip/$top/$count and server-driven paging, single entities with $expand, POST (deep insert,
// through a navigation, bound actions), PATCH/DELETE with ETag checks, and multipart $batch with one atomic changeset.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { compileFilter, orderRows } from './odata-filter';

export const SERVICE_PATH = '/sap/opu/odata4/sap/zfs_sb_almtimebkt_o4_api/srvd_a2x/sap/zfs_sd_almtimebkt/0001/';
export type MockRow = Record<string, unknown>;
export interface MockNav { set: string; link: Record<string, string> }
export interface MockSet {
  key: string;
  /** Several key properties (e.g. Deal and Seq); default [key]. */
  keys?: string[];
  rows: MockRow[];
  /** Navigation property → child set and, per child property, the parent property it holds. */
  nav?: Record<string, MockNav>;
  /** Assigns the key of a created row that has none (numbers SAP assigns). */
  autoKey?: () => string;
  /** RAP `etag dependent by _Parent`: the rows carry and check their parent's ETag, not their own. */
  etagFromParent?: boolean;
  /** Bound action name → what it does to the row. */
  actions?: Record<string, (row: MockRow) => void>;
}
export interface LoggedRequest { method: string; rel: string; query: URLSearchParams; headers: IncomingMessage['headers']; body: string }
export interface MockSapOptions {
  user?: string;
  password?: string;
  client?: string;
  /** Server page size; otherwise the client's `Prefer: odata.maxpagesize`, otherwise everything. */
  pageSize?: number;
  /** Report this many more rows in @odata.count than exist (to test truncation detection). */
  countExtra?: number;
  /** Page size of `$expand`ed collections (the rest is announced with <nav>@odata.nextLink). */
  expandPageSize?: number;
  /** How @odata.count is reported: a number (default), a numeric string (Edm.Int64 with IEEE754Compatible) or not at all. */
  countStyle?: 'number' | 'string' | 'none';
  sets?: Record<string, MockSet>;
}
export interface MockSap {
  base: string;
  log: LoggedRequest[];
  sets: Record<string, MockSet>;
  expireToken(): void;
  /** The next request (of `method`, if given) fails with this status and SAP-style error. */
  failNext(status: number, message: string, method?: string): void;
  redirectNext(): void;
  htmlNext(): void;
  close(): Promise<void>;
}
type Answer = { status: number; body: string };

const nl = '\r\n';
const errorBody = (message: string) => JSON.stringify({ error: { code: 'MOCK', message } });
const failed = (status: number, message: string): Answer => ({ status, body: errorBody(message) });
const keysOf = (set: MockSet) => set.keys ?? [set.key];
const sameKey = (set: MockSet, row: MockRow, key: MockRow) => keysOf(set).every(k => String(row[k]) === String(key[k]));
const linked = (nav: MockNav, child: MockRow, parent: MockRow) => Object.entries(nav.link).every(([cp, pp]) => String(child[cp]) === String(parent[pp]));
const linkValues = (nav: MockNav, parent: MockRow) => Object.fromEntries(Object.entries(nav.link).map(([cp, pp]) => [cp, parent[pp]]));
// Stands in for a RAP validation failing on SAP.
const rejected = (row: MockRow) => Object.values(row).includes('SAP-REJECT');

/** `'B01'`, `Bucket='B01'` or `Deal='0001',Seq=2` → key values (quotes doubled inside strings). */
function parseKey(set: MockSet, text: string): MockRow | null {
  const parts: string[] = [];
  let cur = '', quoted = false;
  for (const ch of text) {
    if (ch === "'") quoted = !quoted;
    if (ch === ',' && !quoted) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const value = (t: string) => (t.startsWith("'") && t.endsWith("'") ? t.slice(1, -1).replace(/''/g, "'") : t);
  if (parts.length === 1 && !/^\w+=/.test(parts[0])) return { [keysOf(set)[0]]: value(parts[0]) };
  const out: MockRow = {};
  for (const p of parts) { const m = /^(\w+)=(.*)$/.exec(p); if (!m) return null; out[m[1]] = value(m[2]); }
  return out;
}

export function timeBucketSets(): Record<string, MockSet> {
  const bucket = (b: string, d: string, rbi = true): MockRow => ({
    Bucket: b, Description: d, XbrlCode: `X-${b}`, FromNo: '1', FromFreq: '01', ToNo: '7', ToFreq: '01',
    ...(rbi ? { RbiNo: '1' } : {}), FromDays: '1', ToDays: '7',
    CreatedBy: 'SAMPLE', CreatedDate: '20260915', CreatedTime: '090000', ChangedBy: '', ChangedDate: '', ChangedTime: ''
  });
  return {
    Alm1Bucket: { key: 'Bucket', rows: [bucket('B01', 'Day 1'), bucket('B02', '2 to 7 days')] },
    Alm2Bucket: { key: 'Bucket', rows: [bucket('C01', 'Up to 7 days', false)] },
    FrequencyDomain: {
      key: 'Value',
      rows: [
        { DomainField: 'ZFR_TP', Value: '01', Text: 'Day(s)' }, { DomainField: 'ZFR_TP', Value: '02', Text: 'Month(s)' },
        { DomainField: 'ZTO_TP', Value: '01', Text: 'Day(s)' }, { DomainField: 'ZTO_TP', Value: '02', Text: 'Month(s)' }
      ]
    }
  };
}

export async function startMockSap(options: MockSapOptions = {}): Promise<MockSap> {
  const user = options.user ?? 'TESTER', password = options.password ?? 'secret', client = options.client ?? '100';
  const sets = options.sets ?? timeBucketSets();
  let version = 1;
  const touch = (row: MockRow) => { row['@odata.etag'] = `W/"${version++}"`; };
  for (const set of Object.values(sets)) for (const row of set.rows) touch(row);
  const log: LoggedRequest[] = [];
  const tokens = new Map<string, string>();
  let failure: { status: number; message: string; method?: string } | null = null, redirect = false, html = false;

  const send = (res: ServerResponse, status: number, body = '', headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body);
  };
  const children = (state: Record<string, MockSet>, nav: MockNav, parent: MockRow) => state[nav.set]?.rows.filter(c => linked(nav, c, parent)) ?? [];
  /** A changed item changes its parent's ETag, as RAP's total ETag does. */
  function touchParents(state: Record<string, MockSet>, setName: string, child: MockRow) {
    for (const parentSet of Object.values(state)) for (const nav of Object.values(parentSet.nav ?? {})) {
      if (nav.set !== setName) continue;
      for (const p of parentSet.rows) if (linked(nav, child, p)) touch(p);
    }
  }

  /** The row that holds `child` through a navigation (first match). */
  function parentOf(state: Record<string, MockSet>, setName: string, child: MockRow): MockRow | undefined {
    for (const parentSet of Object.values(state)) for (const nav of Object.values(parentSet.nav ?? {})) {
      if (nav.set !== setName) continue;
      const p = parentSet.rows.find(r => linked(nav, child, r));
      if (p) return p;
    }
    return undefined;
  }
  const etagOf = (state: Record<string, MockSet>, setName: string, row: MockRow) =>
    (state[setName]?.etagFromParent ? parentOf(state, setName, row)?.['@odata.etag'] : row['@odata.etag']);

  function insert(state: Record<string, MockSet>, setName: string, row: MockRow): Answer {
    const set = state[setName];
    if (!set) return failed(404, `Unknown entity set ${setName}`);
    const nested = Object.entries(set.nav ?? {}).filter(([n]) => Array.isArray(row[n])).map(([n, nav]) => [nav, row[n] as MockRow[]] as const);
    for (const n of Object.keys(set.nav ?? {})) delete row[n];
    if (rejected(row) || nested.some(([, list]) => list.some(rejected))) return failed(400, 'Rejected by RAP validation');
    if (set.autoKey && keysOf(set).some(k => row[k] == null || row[k] === '')) row[keysOf(set)[0]] = set.autoKey();
    if (set.rows.some(r => sameKey(set, r, row))) return failed(400, `Entry ${keysOf(set).map(k => String(row[k])).join('/')} already exists`);
    touch(row);
    set.rows.push(row);
    // Deep insert: the items arrive inside their header and get its key.
    for (const [nav, list] of nested) for (const item of list) { const child = { ...item, ...linkValues(nav, row) }; touch(child); state[nav.set].rows.push(child); }
    touchParents(state, setName, row);
    return { status: 201, body: JSON.stringify(row) };
  }

  function apply(method: string, rel: string, body: string, headers: Record<string, string | string[] | undefined>, state: Record<string, MockSet>): Answer {
    const path = decodeURIComponent(rel);
    if (method === 'POST' && /^\w+$/.test(path)) return insert(state, path, JSON.parse(body || '{}') as MockRow);
    const m = /^(\w+)\((.*)\)(?:\/([\w.]+))?$/.exec(path);
    const set = m ? state[m[1]] : undefined;
    const key = m && set ? parseKey(set, m[2]) : null;
    if (!m || !set || !key) return failed(404, 'Not found');
    const row = set.rows.find(r => sameKey(set, r, key));
    if (!row) return failed(404, `Entry ${Object.values(key).join('/')} does not exist`);
    const tail = m[3];
    const nav = tail ? set.nav?.[tail] : undefined;
    if (method === 'POST' && nav) return insert(state, nav.set, { ...(JSON.parse(body || '{}') as MockRow), ...linkValues(nav, row) });
    const ifMatch = headers['if-match'];
    if (!ifMatch) return failed(428, 'Precondition required');
    if (ifMatch !== '*' && ifMatch !== etagOf(state, m[1], row)) return failed(412, 'The entry was changed by another user');
    if (method === 'POST' && tail && set.actions?.[tail]) { set.actions[tail](row); touch(row); return { status: 200, body: JSON.stringify(row) }; }
    if (tail) return failed(404, `Unknown navigation or action ${tail}`);
    if (method === 'PATCH') {
      const patch = JSON.parse(body || '{}') as MockRow;
      if (rejected(patch)) return failed(400, 'Rejected by RAP validation');
      Object.assign(row, patch);
      touch(row);
      touchParents(state, m[1], row);
      return { status: 200, body: JSON.stringify(row) };
    }
    if (method === 'DELETE') {
      set.rows.splice(set.rows.indexOf(row), 1);
      // RAP deletes the children of a deleted parent.
      for (const n of Object.values(set.nav ?? {})) { const gone = new Set(children(state, n, row)); state[n.set].rows = state[n.set].rows.filter(c => !gone.has(c)); }
      touchParents(state, m[1], row);
      return { status: 204, body: '' };
    }
    return failed(405, 'Method not allowed');
  }

  function batch(body: string, res: ServerResponse) {
    const changeset = /boundary=([^\s;]+)/.exec(body)?.[1];
    const parts = changeset ? body.split(`--${changeset}`).slice(1).filter(p => !p.startsWith('--')) : [];
    // Work on copies of the rows (sets also hold functions, which structuredClone refuses); commit only if all succeed.
    const state: Record<string, MockSet> = Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, { ...s, rows: s.rows.map(r => ({ ...r })) }]));
    const answers: Answer[] = [];
    for (const part of parts) {
      const sections = part.split(nl + nl);
      const [requestLine, ...headerLines] = (sections[1] ?? '').split(nl);
      const [method, rel] = requestLine.split(' ');
      const headers = Object.fromEntries(headerLines.map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
      const answer = apply(method, rel, sections.slice(2).join(nl + nl).trim(), headers, state);
      if (answer.status >= 400) {
        // A failed changeset answers with one error part and changes nothing.
        return send(res, 200, `--batchresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}${nl}HTTP/1.1 ${answer.status} Error${nl}Content-Type: application/json${nl}${nl}${answer.body}${nl}--batchresponse_1--${nl}`,
          { 'content-type': 'multipart/mixed; boundary=batchresponse_1' });
      }
      answers.push(answer);
    }
    for (const k of Object.keys(sets)) sets[k].rows = state[k].rows;
    const out = answers.map((a, i) => `--changesetresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: ${i + 1}${nl}${nl}HTTP/1.1 ${a.status} OK${nl}Content-Type: application/json${nl}${nl}${a.body}${nl}`).join('');
    send(res, 200, `--batchresponse_1${nl}Content-Type: multipart/mixed; boundary=changesetresponse_1${nl}${nl}${out}--changesetresponse_1--${nl}--batchresponse_1--${nl}`,
      { 'content-type': 'multipart/mixed; boundary=batchresponse_1' });
  }

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://mock');
      const body = Buffer.concat(chunks).toString('utf8');
      const method = req.method ?? 'GET';
      const rel = url.pathname.startsWith(SERVICE_PATH) ? url.pathname.slice(SERVICE_PATH.length) : null;
      log.push({ method, rel: rel ?? url.pathname, query: url.searchParams, headers: req.headers, body });
      const expected = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
      // Like SAP: a missing or wrong client is a failed logon (the system default client is not 100).
      if (url.searchParams.getAll('sap-client').join(',') !== client || req.headers.authorization !== expected) return send(res, 401, errorBody('Logon failed'));
      if (rel === null) return send(res, 404, errorBody('No service'));
      if (redirect) { redirect = false; return send(res, 302, '', { location: 'https://idp.example/login' }); }
      if (html) { html = false; return send(res, 200, '<html><body>Logon</body></html>', { 'content-type': 'text/html' }); }
      // The session the relay keeps for this SAP user (the account is checked above).
      const sessionId = expected;
      if (req.headers['x-csrf-token'] === 'Fetch') {
        const token = `tok-${tokens.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
        tokens.set(sessionId, token);
        return send(res, 200, '{}', { 'x-csrf-token': token });
      }
      if (method !== 'GET') {
        const token = tokens.get(sessionId);
        if (!token || req.headers['x-csrf-token'] !== token) return send(res, 403, errorBody('CSRF token validation failed'), { 'x-csrf-token': 'Required' });
      }
      if (failure && (!failure.method || failure.method === method)) { const f = failure; failure = null; return send(res, f.status, errorBody(f.message)); }
      if (method === 'GET' && rel === '$metadata') {
        return send(res, 200, '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices/></edmx:Edmx>', { 'content-type': 'application/xml' });
      }
      if (method === 'GET') {
        const one = /^(\w+)\((.*)\)$/.exec(decodeURIComponent(rel));
        if (one) {
          // One entity, its navigations inline when $expand names them.
          const set = sets[one[1]];
          const key = set ? parseKey(set, one[2]) : null;
          const row = set && key ? set.rows.find(r => sameKey(set, r, key)) : undefined;
          if (!set || !row) return send(res, 404, errorBody('Entry does not exist'));
          const expand = (url.searchParams.get('$expand') ?? '').split(',').filter(Boolean);
          const expanded = (n: string) => {
            const nav = set.nav?.[n];
            const list = nav ? children(sets, nav, row).map(c => (sets[nav.set]?.etagFromParent ? { ...c, '@odata.etag': row['@odata.etag'] } : c)) : [];
            // Server-driven paging of an expanded collection: the rest only through <nav>@odata.nextLink.
            const size = options.expandPageSize;
            return size && list.length > size ? [[n, list.slice(0, size)], [`${n}@odata.nextLink`, `${rel}/${n}?$skiptoken=${size}`]] : [[n, list]];
          };
          return send(res, 200, JSON.stringify({ ...row, ...Object.fromEntries(expand.flatMap(expanded)) }));
        }
        const set = sets[rel];
        if (!set) return send(res, 404, errorBody(`Unknown entity set ${rel}`));
        // Like OData V4: $filter and $orderby first, then $skip/$top (a hard client limit), $count of the filtered set,
        // and server-driven paging (maxpagesize) with an @odata.nextLink that keeps the query.
        const filter = url.searchParams.get('$filter');
        const orderby = url.searchParams.get('$orderby');
        let rows = filter ? set.rows.filter(compileFilter(filter)) : set.rows;
        if (orderby) rows = orderRows(rows, orderby);
        const skip = Number(url.searchParams.get('$skip') ?? 0);
        const top = url.searchParams.has('$top') ? Number(url.searchParams.get('$top')) : Infinity;
        const all = rows.slice(skip, skip + top);
        const preferred = Number(/odata\.maxpagesize=(\d+)/.exec(String(req.headers.prefer ?? ''))?.[1] ?? 0);
        const size = options.pageSize ?? (preferred || all.length || 1);
        const token = Number(url.searchParams.get('$skiptoken') ?? 0);
        const nextParams = new URLSearchParams(url.searchParams);
        nextParams.delete('sap-client');
        nextParams.set('$skiptoken', String(token + size));
        const next = token + size < all.length ? { '@odata.nextLink': `${rel}?${nextParams.toString()}&sap-client=${client}` } : {};
        const total = rows.length + (options.countExtra ?? 0);
        const count = url.searchParams.get('$count') === 'true' && options.countStyle !== 'none' ? { '@odata.count': options.countStyle === 'string' ? String(total) : total } : {};
        return send(res, 200, JSON.stringify({ '@odata.context': `$metadata#${rel}`, ...count, value: all.slice(token, token + size), ...next }));
      }
      if (method === 'POST' && rel === '$batch') return batch(body, res);
      const answer = apply(method, rel, body, req.headers, sets);
      return send(res, answer.status, answer.body);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}${SERVICE_PATH}`,
    log,
    sets,
    expireToken: () => { for (const k of tokens.keys()) tokens.set(k, 'expired'); },
    failNext: (status, message, method) => { failure = { status, message, method }; },
    redirectNext: () => { redirect = true; },
    htmlNext: () => { html = true; },
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })
  };
}
