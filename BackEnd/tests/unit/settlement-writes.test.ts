// The writes of MO: Execute Settlement for Deal ID, as the BackEnd sends them to the SLC middleware (a fake service with its protocol; nothing
// live): TRD_POS and IN_SPOT rows through the module service, the Deal ID status through the tsf-deal-id object service.
import { beforeEach, describe, expect, it } from 'vitest';
import { setPlatform } from '@core/platform';
import type { AppConfig } from '@core/server/config';
import { moduleService, resetModuleBackends } from '@core/server/module-service';
import { objectService } from '@core/server/object-service';
import type { Actor } from '@core/actor';
import { HttpError } from '@/lib/errors';
import type { InvLeg } from '@/pages/execute-settlement/data';
import { positionFields } from '@/pages/execute-settlement/logic';
import { SERVER_MODULES } from '@/modules/server-registry';
import { restBackend } from '../../src/rest/rest-backend';

const actor: Actor = { id: 'u1', username: 'tester', sap: null };
const cfg: AppConfig = { origins: [], nodeEnv: 'test' };
const KEYS: Record<string, string[]> = {
  trdPos: ['zdeal_id', 'zseq'], inSpot: ['ZMOD_ID', 'ZDEAL_ID', 'ZDEAL_TYPE', 'ZDSS_TYPE'], tsfDealId: ['ZDEAL_ID', 'ZDEAL_TYPE', 'ZSUB_TYPE']
};

/** An in-memory middleware with its protocol (GET with column filters and [in], POST { data }, PATCH { key, changes }, DELETE { key }). */
function fakeService(initial: Record<string, Record<string, unknown>[]>) {
  const data = structuredClone(initial);
  const calls: { method: string; resource: string; query: URLSearchParams; body?: Record<string, unknown> }[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const same = (row: Record<string, unknown>, key: Record<string, unknown>) => Object.entries(key).every(([c, v]) => String(row[c]) === String(v));
  const handler: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const resource = decodeURIComponent(url.pathname.split('/data/')[1]);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    calls.push({ method, resource, query: url.searchParams, body });
    const rows = (data[resource] ??= []);
    if (method === 'GET') {
      let out = rows;
      for (const [k, v] of url.searchParams) {
        if (['limit', 'offset', 'sort'].includes(k)) continue;
        const inList = /^(.*)\[in\]$/.exec(k);
        out = inList ? out.filter(r => v.split(',').includes(String(r[inList[1]]))) : out.filter(r => String(r[k]) === v);
      }
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 500);
      return json(200, { ok: true, rows: out.slice(offset, offset + limit) });
    }
    if (method === 'POST') {
      const row = { ...(body?.data as Record<string, unknown>) };
      const key = Object.fromEntries(KEYS[resource].map(c => [c, row[c]]));
      if (rows.some(r => same(r, key))) return json(409, { ok: false, error: { message: 'Duplicate key' } });
      rows.push(row);
      return json(201, { ok: true, key });
    }
    const key = body?.key as Record<string, unknown>;
    const at = rows.findIndex(r => same(r, key));
    if (at < 0) return json(404, { ok: false, error: { message: 'Row not found' } });
    if (method === 'PATCH') rows[at] = { ...rows[at], ...(body?.changes as Record<string, unknown>) };
    else rows.splice(at, 1);
    return json(200, { ok: true, affectedRows: 1 });
  };
  return { data, calls, handler };
}

const DEAL = {
  ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1', ZDEAL_DESC: 'OSIPL_FX_2026 / OGA-DMCC-OSIPL', ZFX_INV_MODEL: '', ZS_DATE: '2026-09-30', ZE_DATE: '2026-10-30', ZMC_REF: '2000000005', ZTRD_CODE: '',
  ZREGION_ID: '', ZDEAL_REF: '', ZTSF_MODEL: 'M032', ZBUKRS1: 'SG03', ZRFHA1: '7000000000001', ZBUKRS2: 'SG03', ZRFHA2: '3000000000005', ZDEAL_STAT: '10', ZPL: '0.00', ZPL_CURR: '', ZPL_RATE: '0.0000000',
  ZPL_LAMT: '0.00', ZPL_LCURR: '', ZCONFIRM: '', ZDM: '', ZMC_CURR_ID: 'C002', ZMC_CURR_DESC: 'USD-USD-INR', ZDEAL_CURR_ID: 'C002', ZDEAL_CURR_DESC: 'USD-USD-INR', ZREV_DEDATE: null, ZSS: '', ZOVER_UTL: '', ZDEAL_AMT: '1000.00',
  ZCREATED_BY: 'DEMO', ZCREATED_DATE: '2026-10-01', ZCREATED_TIME: '13:15:50', ZCHANGED_BY: '', ZCHANGED_DATE: null, ZCHANGED_TIME: '00:00:00'
};
const leg = (l: string, seq: number): InvLeg => ({
  seq, leg: l, coCode: 'AE13', seller: 'OGA', buyer: 'DMCC', desc: `${l} desc`, docType: 'TR', ref: '', due: '2026-11-16', invAmt: 1869200, invCur: 'USD', payAmt: 1869200, payCur: 'USD', payReason: '', fxDeal: '',
  transferType: '02', fiDoc: '', settled: false, senderBank: '', senderAcc: '', receiverBank: '', receiverAcc: '', partnerId: '', docMsg: '', dssDeal: '', fiType: '02', postDesc: 'Post to Bank Account', setType: '', setCheck: false,
  postCheck: true, premAdj: '', postDate: '', stored: false
});

let service: ReturnType<typeof fakeService>;
beforeEach(() => {
  service = fakeService({ tsfDealId: [DEAL], trdPos: [], inSpot: [] });
  resetModuleBackends();
  setPlatform({
    env: () => ({}),
    keeps: () => true,
    backend: (id, entry) => restBackend(id, entry, { key: 'slc-middleware', title: 'SLC middleware', base: 'https://mw.example/api/v1', headers: {}, fetch: service.handler }),
    layouts: () => { throw new HttpError(404, 'none'); }
  });
});

describe('the settlement tables', () => {
  it('creates TRD_POS rows as the screen builds them: lower-case columns, numbers as JSON numbers, the create stamps, no blank date', async () => {
    const rows = [leg('T3-P', 1), leg('T3-S', 2)].map((l, i) => positionFields('7000000006', l, i, '2026-11-04'));
    const out = await moduleService(cfg, 'settlement-data').change(actor, 'positions', 'create', rows);
    expect(out.result).toMatchObject({ created: 2, updated: 0 });
    const posts = service.calls.filter(c => c.method === 'POST');
    expect(posts.map(c => c.resource)).toEqual(['trdPos', 'trdPos']);
    expect(posts[0].body?.data).toMatchObject({
      zdeal_id: '7000000006', zseq: '1', zt_type: 'T3-P', zrp: 'Payment', zamt: 1869200, zpay_amt: 1869200, zdue_date: '2026-11-16', zp_date: '2026-11-16', zexe_co: '', zbelnr: '', zcreated_by: 'TESTER'
    });
    expect(posts[1].body?.data).toMatchObject({ zseq: '2', zrp: 'Receipt' });
    expect(Object.keys(posts[0].body?.data as object)).not.toContain('client');
  });

  it('updates a stored row by its key, only the fields the screen sends, with the change stamps', async () => {
    const svc = moduleService(cfg, 'settlement-data');
    await svc.change(actor, 'positions', 'create', [positionFields('7000000006', leg('T1-S', 6), 5, '2026-11-04')]);
    const [stored] = (await svc.query(actor, 'positions', { page: 1, pageSize: 500, filters: [{ field: 'dealId', op: 'eq', values: ['7000000006'] }] })).rows;
    expect(stored).toMatchObject({ dealId: '7000000006', seq: '6', exeCo: '' });
    service.calls.length = 0;
    const out = await svc.change(actor, 'positions', 'update', [{ ...stored, exeCo: 'X', recHbkid: 'DBS01' }]);
    expect(out.result).toMatchObject({ updated: 1 });
    const patch = service.calls.find(c => c.method === 'PATCH');
    expect(patch?.body?.key).toEqual({ zdeal_id: '7000000006', zseq: '6' });
    expect(patch?.body?.changes).toMatchObject({ zexe_co: 'X', zrec_hbkid: 'DBS01', zchanged_by: 'TESTER' });
    expect(service.data.trdPos[0]).toMatchObject({ zexe_co: 'X', zrec_hbkid: 'DBS01' });
  });

  it('creates and updates IN_SPOT rows by their four-part key', async () => {
    const svc = moduleService(cfg, 'settlement-data');
    const row = { modId: 'M032', dealId: '7000000006', dealType: 'D1', dssType: 'DSS1', bukrs: 'IN11', rfha: '3000000000033', tType: 'T1', fAmt: '1869200.00', fxAmt: '160000000.00', curr: 'USD', dAmt: '158130800.00', sbukrs: 'OSIPL', bs: 'Sell' };
    await svc.change(actor, 'inSpot', 'create', [row]);
    expect(service.calls.find(c => c.method === 'POST')?.body?.data).toMatchObject({
      ZMOD_ID: 'M032', ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1', ZF_AMT: 1869200, ZFX_AMT: 160000000, ZD_AMT: 158130800, ZSBUKRS: 'OSIPL', ZBS: 'Sell', ZSPOT_TXN: '', ZCREATED_BY: 'TESTER'
    });
    const [stored] = (await svc.query(actor, 'inSpot', { page: 1, pageSize: 500, filters: [{ field: 'dealId', op: 'eq', values: ['7000000006'] }] })).rows;
    expect(stored).toMatchObject({ dealType: 'D1', dssType: 'DSS1', fAmt: '1869200', bs: 'Sell' });
    await svc.change(actor, 'inSpot', 'update', [{ ...stored, fAmt: '2000000.00' }]);
    expect(service.calls.find(c => c.method === 'PATCH')?.body).toEqual({ key: { ZMOD_ID: 'M032', ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'D1', ZDSS_TYPE: 'DSS1' }, changes: expect.objectContaining({ ZF_AMT: 2000000 }) });
    // the same key twice is a duplicate, not a second row
    await expect(svc.change(actor, 'inSpot', 'create', [row])).rejects.toMatchObject({ status: 422 });
  });
});

describe('the Deal ID status', () => {
  it('Initiate / Execution Complete change only ZDEAL_STAT (with the change stamps) through the tsf-deal-id update', async () => {
    const svc = objectService(cfg, 'tsf-deal-id');
    const key = { dealId: '7000000006', dealType: 'FX', subType: 'FX1' };
    const stored = await svc.read(actor, key);
    expect(stored.header.status).toBe('10');
    const { __etag, ...record } = stored.header;
    const out = await svc.update(actor, { key, etag: __etag, header: { ...record, status: '20' } });
    expect(out.header.status).toBe('20');
    const patch = service.calls.find(c => c.method === 'PATCH');
    expect(patch?.resource).toBe('tsfDealId');
    expect(patch?.body?.key).toEqual({ ZDEAL_ID: '7000000006', ZDEAL_TYPE: 'FX', ZSUB_TYPE: 'FX1' });
    expect(Object.keys(patch?.body?.changes as object).sort()).toEqual(['ZCHANGED_BY', 'ZCHANGED_DATE', 'ZCHANGED_TIME', 'ZDEAL_STAT']);
    expect((patch?.body?.changes as Record<string, unknown>).ZDEAL_STAT).toBe('20');
    // 20 -> 21 (Execution Complete) and the revised end date (Amend End Date) go the same way
    const again = await svc.read(actor, key);
    await svc.update(actor, { key, etag: again.header.__etag, header: { ...record, status: '21', revisedEndDate: '2027-01-31' } });
    expect(service.data.tsfDealId[0]).toMatchObject({ ZDEAL_STAT: '21', ZREV_DEDATE: '2027-01-31' });
  });

  it('refuses a save of a Deal ID another user changed after it was read (409)', async () => {
    const svc = objectService(cfg, 'tsf-deal-id');
    const key = { dealId: '7000000006', dealType: 'FX', subType: 'FX1' };
    const stored = await svc.read(actor, key);
    const { __etag, ...record } = stored.header;
    service.data.tsfDealId[0].ZDEAL_DESC = 'changed by someone else';
    await expect(svc.update(actor, { key, etag: __etag, header: { ...record, status: '20' } })).rejects.toMatchObject({ status: 409 });
    expect(service.calls.some(c => c.method === 'PATCH')).toBe(false);
  });
});

describe('registration', () => {
  it('serves the settlement data from the REST data service', () => {
    expect(SERVER_MODULES['settlement-data'].source).toBe('rest');
    expect(SERVER_MODULES['settlement-data'].rest?.service).toBe('slc-middleware');
  });
});
