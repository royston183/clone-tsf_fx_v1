// tests/e2e/relay-stub.ts
// The SAP relay of the e2e tests: a stand-in for http://localhost:3001 that answers what the browser's OData backend
// sends for Time Buckets (ZFS_SB_ALMTIMEBKT_O4_API) from the module's sample data (src/modules/time-buckets/seed.json).
// It runs inside the test (page.route), one state per page, so no real relay, SAP system or port is ever involved.
// Like SAP it checks the SAP account (Basic) and sap-client, hands out a CSRF token, answers $metadata, the entity
// sets ($filter, $orderby, $skip, $top, $count, server paging), single entities, and a multipart $batch with one
// changeset (ETag checks, all or nothing).
import { readFileSync } from 'node:fs';
import { compileFilter, orderRows } from '../support/odata-filter';
import { MOCK_SAP_SECRET, MOCK_SAP_USER } from '../support/demo';

// Read when a page starts (e2e runs from the FrontEnd folder, as playwright.config.ts's own paths do).
const readSeed = () => JSON.parse(readFileSync('src/modules/time-buckets/seed.json', 'utf8')) as {
  tables: Record<'alm1' | 'alm2', Record<string, string>[]>;
  lookups: { freqDomain: { field: string; value: string; text: string }[] };
};

export const RELAY_ORIGIN = 'http://127.0.0.1:3399';
export const SERVICE_PATH = '/sap/opu/odata4/sap/zfs_sb_almtimebkt_o4_api/srvd_a2x/sap/zfs_sd_almtimebkt/0001/';
export const SAP_ACCOUNT = { username: MOCK_SAP_USER, password: MOCK_SAP_SECRET, client: '100' };

type Row = Record<string, unknown>;
interface Answer { status: number; body: string }
const nl = '\r\n';
const pascal = (f: string) => f.charAt(0).toUpperCase() + f.slice(1);
const STAMPS: Record<string, string> = { enteredBy: 'CreatedBy', enteredOn: 'CreatedDate', entryTime: 'CreatedTime', changedBy: 'ChangedBy', changedOn: 'ChangedDate', changedTime: 'ChangedTime' };
const errorBody = (message: string) => JSON.stringify({ error: { code: 'STUB', message } });

export interface RelayStub {
  /** The requests this stub answered, `METHOD path`. */
  log: string[];
  handle(request: { method: string; url: string; headers: Record<string, string>; body: string }): Answer & { headers: Record<string, string> };
}

export /** SAP stamps who and when, like the RAP managed fields: `Created*` on create, `Changed*` on change. */
function stamp(kind: 'Created' | 'Changed', row: Row) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  row[`${kind}By`] = SAP_ACCOUNT.username;
  row[`${kind}Date`] = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  row[`${kind}Time`] = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function createRelayStub(): RelayStub {
  const seed = readSeed();
  let version = 1;
  const touch = (row: Row) => { row['@odata.etag'] = `W/"${version++}"`; };
  const rowsOf = (list: Record<string, string>[]): Row[] => list.map(r => {
    const row: Row = Object.fromEntries(Object.entries(r).map(([k, v]) => [STAMPS[k] ?? pascal(k), v]));
    touch(row);
    return row;
  });
  const sets: Record<string, Row[]> = {
    Alm1Bucket: rowsOf(seed.tables.alm1),
    Alm2Bucket: rowsOf(seed.tables.alm2),
    FrequencyDomain: seed.lookups.freqDomain.map(l => ({ DomainField: l.field, Value: l.value, Text: l.text }))
  };
  const log: string[] = [];
  const token = 'stub-csrf-token';
  const expected = `Basic ${Buffer.from(`${SAP_ACCOUNT.username}:${SAP_ACCOUNT.password}`).toString('base64')}`;

  const keyOf = (text: string): string | null => {
    const m = /^(?:Bucket=)?'((?:[^']|'')*)'$/.exec(text);
    return m ? m[1].replace(/''/g, "'") : null;
  };

  function apply(state: Record<string, Row[]>, method: string, rel: string, body: string, headers: Record<string, string>): Answer {
    const path = decodeURIComponent(rel);
    if (method === 'POST' && /^\w+$/.test(path)) {
      const list = state[path];
      if (!list) return { status: 404, body: errorBody(`Unknown entity set ${path}`) };
      const row = JSON.parse(body || '{}') as Row;
      if (list.some(r => r.Bucket === row.Bucket)) return { status: 400, body: errorBody(`Entry ${String(row.Bucket)} already exists`) };
      stamp('Created', row);
      touch(row);
      list.push(row);
      return { status: 201, body: JSON.stringify(row) };
    }
    const m = /^(\w+)\((.*)\)$/.exec(path);
    const list = m ? state[m[1]] : undefined;
    const key = m ? keyOf(m[2]) : null;
    if (!m || !list || key === null) return { status: 404, body: errorBody('Not found') };
    const row = list.find(r => r.Bucket === key);
    if (!row) return { status: 404, body: errorBody(`Entry ${key} does not exist`) };
    const ifMatch = headers['if-match'];
    if (!ifMatch) return { status: 428, body: errorBody('Precondition required') };
    if (ifMatch !== '*' && ifMatch !== row['@odata.etag']) return { status: 412, body: errorBody('The entry was changed by another user') };
    if (method === 'PATCH') { Object.assign(row, JSON.parse(body || '{}') as Row); stamp('Changed', row); touch(row); return { status: 200, body: JSON.stringify(row) }; }
    if (method === 'DELETE') { list.splice(list.indexOf(row), 1); return { status: 204, body: '' }; }
    return { status: 405, body: errorBody('Method not allowed') };
  }

  function batch(body: string): Answer & { headers: Record<string, string> } {
    const changeset = /boundary=([^\s;]+)/.exec(body)?.[1];
    const parts = changeset ? body.split(`--${changeset}`).slice(1).filter(p => !p.startsWith('--')) : [];
    // Work on copies; commit only when every operation succeeds (one atomic changeset).
    const state = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.map(r => ({ ...r }))]));
    const answers: Answer[] = [];
    const headers = { 'content-type': 'multipart/mixed; boundary=batchresponse_1' };
    for (const part of parts) {
      const sections = part.split(nl + nl);
      const [requestLine, ...headerLines] = (sections[1] ?? '').split(nl);
      const [method, rel] = requestLine.split(' ');
      const h = Object.fromEntries(headerLines.map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim().toLowerCase(), l.slice(i + 1).trim()]; }));
      const answer = apply(state, method, rel, sections.slice(2).join(nl + nl).trim(), h);
      if (answer.status >= 400) {
        return { status: 200, headers, body: `--batchresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}${nl}HTTP/1.1 ${answer.status} Error${nl}Content-Type: application/json${nl}${nl}${answer.body}${nl}--batchresponse_1--${nl}` };
      }
      answers.push(answer);
    }
    for (const k of Object.keys(sets)) sets[k] = state[k];
    const out = answers.map((a, i) => `--changesetresponse_1${nl}Content-Type: application/http${nl}Content-Transfer-Encoding: binary${nl}Content-ID: ${i + 1}${nl}${nl}HTTP/1.1 ${a.status} OK${nl}Content-Type: application/json${nl}${nl}${a.body}${nl}`).join('');
    return { status: 200, headers, body: `--batchresponse_1${nl}Content-Type: multipart/mixed; boundary=changesetresponse_1${nl}${nl}${out}--changesetresponse_1--${nl}--batchresponse_1--${nl}` };
  }

  return {
    log,
    handle({ method, url: href, headers, body }) {
      const url = new URL(href);
      const json = { 'content-type': 'application/json' };
      const reply = (status: number, text = '', extra: Record<string, string> = {}) => ({ status, body: text, headers: { ...json, ...extra } });
      log.push(`${method} ${url.pathname}`);
      // Like SAP: a wrong client or account is a failed logon.
      if (url.searchParams.getAll('sap-client').join(',') !== SAP_ACCOUNT.client || headers.authorization !== expected) return reply(401, errorBody('Logon failed'));
      if (!url.pathname.startsWith(SERVICE_PATH)) return reply(404, errorBody('No service'));
      const rel = url.pathname.slice(SERVICE_PATH.length);
      if (headers['x-csrf-token'] === 'Fetch') return reply(200, '{}', { 'x-csrf-token': token });
      if (method !== 'GET' && headers['x-csrf-token'] !== token) return reply(403, errorBody('CSRF token validation failed'), { 'x-csrf-token': 'Required' });
      if (method === 'GET' && rel === '$metadata') {
        return reply(200, '<?xml version="1.0" encoding="utf-8"?><edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx"><edmx:DataServices/></edmx:Edmx>', { 'content-type': 'application/xml' });
      }
      if (method === 'POST' && rel === '$batch') return batch(body);
      if (method !== 'GET') { const a = apply(sets, method, rel, body, headers); return reply(a.status, a.body); }
      const one = /^(\w+)\((.*)\)$/.exec(decodeURIComponent(rel));
      if (one) {
        const row = sets[one[1]]?.find(r => r.Bucket === keyOf(one[2]));
        return row ? reply(200, JSON.stringify(row)) : reply(404, errorBody('Entry does not exist'));
      }
      const list = sets[rel];
      if (!list) return reply(404, errorBody(`Unknown entity set ${rel}`));
      const filter = url.searchParams.get('$filter');
      const orderby = url.searchParams.get('$orderby');
      let rows = filter ? list.filter(compileFilter(filter)) : list;
      if (orderby) rows = orderRows(rows, orderby);
      const skip = Number(url.searchParams.get('$skip') ?? 0);
      const top = url.searchParams.has('$top') ? Number(url.searchParams.get('$top')) : Infinity;
      const all = rows.slice(skip, skip + top);
      const size = Number(/odata\.maxpagesize=(\d+)/.exec(headers.prefer ?? '')?.[1] ?? 0) || all.length || 1;
      const from = Number(url.searchParams.get('$skiptoken') ?? 0);
      const next = new URLSearchParams(url.searchParams);
      next.delete('sap-client');
      next.set('$skiptoken', String(from + size));
      const more = from + size < all.length ? { '@odata.nextLink': `${rel}?${next.toString()}&sap-client=${SAP_ACCOUNT.client}` } : {};
      const count = url.searchParams.get('$count') === 'true' ? { '@odata.count': rows.length } : {};
      return reply(200, JSON.stringify({ '@odata.context': `$metadata#${rel}`, ...count, value: all.slice(from, from + size), ...more }));
    }
  };
}
