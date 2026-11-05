// tests/integration/object-service.test.ts
import type { Actor } from '@core/actor';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { backendFor } from '@core/server/module-service';
import { objectService } from '@core/server/object-service';
import { CONFLICT_MESSAGE } from '@core/server/odata-backend';
import { contract } from '@/modules/samples/deals/contract';
import { deals } from '@/modules/samples/deals/definition';
import { dealsSeed } from '@/modules/samples/deals/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import { cleanValues } from '@/lib/fields';
import type { FieldDef } from '@/lib/fields/types';
import type { Row } from '@/lib/grid/types';
import type { AnyObjectDef, ObjectAction } from '@/modules/types';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig, setMockRelay } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';

installTestPlatform();

const RELEASE = 'com.sap.gateway.srvd_a2x.zfs_sd_sampledeal.v0001.Release';

/** The first 20 sample deals as SAP holds them. */
function dealSets(): Record<string, MockSet> {
  const { tables } = dealsSeed(20);
  let next = 10020;
  return {
    Deal: {
      key: 'Deal',
      rows: tables.deals.map(d => ({ Deal: d.deal, Name: d.name, Product: d.product, Counterparty: d.counterparty, Amount: Number(d.amount), Currency: d.currency, Start: d.start, End: d.end, Rate: Number(d.rate), Remarks: d.remarks, Status: d.status })),
      nav: { _Flows: { set: 'DealFlow', link: { Deal: 'Deal' } } },
      autoKey: () => String(++next).padStart(10, '0'),
      actions: { [RELEASE]: row => { row.Status = 'R'; } }
    },
    DealFlow: { key: 'Deal', keys: ['Deal', 'Seq'], rows: tables.flows.map(f => ({ Deal: f.deal, Seq: Number(f.seq), PayDate: f.payDate, FlowType: f.flowType, Amount: Number(f.amount), Currency: f.currency })) }
  };
}
const batches = (sap: MockSap) => sap.log.filter(r => r.rel === '$batch');
/** The operations of a $batch body in order: request line and If-Match (none: undefined). */
const operations = (body: string) => [...body.matchAll(/^(POST|PATCH|DELETE) (\S+) HTTP\/1\.1\r\n((?:[^\r\n]+\r\n)*)/gm)]
  .map(m => ({ line: `${m[1]} ${m[2]}`, ifMatch: /^If-Match: (.*)$/m.exec(m[3])?.[1]?.trim() }));
/** The Deals sample under another id with a changed contract (e.g. items that share the header's ETag). */
function register(id: string, changes: Partial<typeof contract>) {
  SERVER_MODULES[id] = { def: { ...deals, id }, contract: { ...contract, ...changes }, seed: () => dealsSeed(20), source: 'sap' };
}
const PARENT_ETAG = { object: { items: { flows: { navigation: '_Flows' } }, itemEtag: 'parent' as const } };
const REASON: FieldDef = { field: 'reason', label: 'Reason', type: 'text', max: 20 };
/** An action that asks for a new end date and a reason, then applies them to the deal. */
const EXTEND: ObjectAction = {
  id: 'extend', label: 'Extend', sapAction: 'Extend', confirm: 'Extend this deal to a new end date.',
  inputs: [{ field: 'newEnd', label: 'New End Date *', type: 'date', required: true }, REASON],
  apply: (_header, values) => ({ end: values.newEnd, remarks: values.reason })
};
/** Who ran LOGGED_EXTEND's applyItems (its `user`). */
const appliedBy: string[] = [];
/**
 * Extend with a rule against the stored end date (check) and a fee row per extension (applyItems): the row carries a
 * field the grid does not have, and a tab the deal does not have, which the save drops.
 */
const LOGGED_EXTEND: ObjectAction = {
  ...EXTEND,
  check: (h, v): Record<string, string> => (v.newEnd && h.end && v.newEnd <= h.end ? { newEnd: 'New End Date must be after the current end date.' } : {}),
  applyItems: (h, items, v, user) => {
    appliedBy.push(user);
    return { flows: [...(items.flows ?? []), { seq: '99', payDate: v.newEnd, flowType: 'FEE', amount: '1,000', currency: h.currency, changedBy: user }], nope: [{ seq: '1' }] };
  }
};
/** The Deals sample under another id, with these changes, on its own data (`app`) or on sample data (no source). */
function variant(id: string, source: 'app' | undefined, changes: Partial<AnyObjectDef>) {
  SERVER_MODULES[id] = { def: { ...deals, id, ...changes }, contract, seed: () => dealsSeed(20), source };
  return objectService(freshConfig(), id);
}

beforeAll(() => { SERVER_MODULES['sample-deals'] = { def: deals, contract, seed: () => dealsSeed(20), source: 'sap' }; });

describe('object pages on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  // A new SAP connection per test: a CSRF token of the previous mock server would cost a 403 and a retried $batch.
  let user: Actor;
  beforeEach(async () => {
    user = actingAs(newSapConnection('TESTER', 'secret'));
    sap = await startMockSap({ sets: dealSets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it('reads a deal with its cash flows in one request ($expand)', async () => {
    const obj = await objectService(cfg, 'sample-deals').read(user, { deal: '0000010002' });
    expect(obj.header).toMatchObject({ deal: '0000010002', currency: 'INR' });
    expect(obj.header.amount).toMatch(/^\d+\.00$/);
    expect(obj.header.__etag).toMatch(/^W\//);
    expect(obj.items.flows.map(f => f.seq)).toEqual(['1', '2', '3']);
    const gets = sap.log.filter(r => r.method === 'GET');
    expect(gets).toHaveLength(1);
    expect(decodeURIComponent(gets[0].rel)).toBe("Deal(Deal='0000010002')");
    expect(gets[0].query.get('$expand')).toBe('_Flows');
  });

  it('type-checks the key before SAP is asked (400): a number key that is not one never reaches the URL', async () => {
    await expect(objectService(cfg, 'sample-deals').read(user, { deal: '00000100021' })).rejects.toMatchObject({ status: 400, message: 'Deal allows at most 10 characters.' });
    const header = deals.header.map(d => (d.field === 'deal' ? { ...d, type: 'integer' as const } : d));
    SERVER_MODULES['test-deals-numkey'] = { def: { ...deals, id: 'test-deals-numkey', header }, contract: { ...contract, keyTypes: { ...contract.keyTypes, deal: 'number' } }, seed: () => dealsSeed(20), source: 'sap' };
    const svc = objectService(cfg, 'test-deals-numkey');
    await expect(svc.read(user, { deal: "1)/Other(x='y'" })).rejects.toMatchObject({ status: 400, message: 'Deal must be a whole number.' });
    await expect(svc.update(user, { key: { deal: '1) or' }, etag: 'W/"1"', header: {} })).rejects.toMatchObject({ status: 400 });
    await expect(svc.remove(user, { key: { deal: '1)' }, etag: 'W/"1"' })).rejects.toMatchObject({ status: 400 });
    expect(sap.log).toHaveLength(0);
  });

  it('reading a deal that no longer exists is 404 with its key', async () => {
    await expect(objectService(cfg, 'sample-deals').read(user, { deal: '0000099999' })).rejects.toMatchObject({ status: 404, message: 'Deal 0000099999 no longer exists.' });
  });

  it('saves header and item changes as one $batch changeset', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010002' };
    const obj = await svc.read(user, key);
    const [f1, , f3] = obj.items.flows;
    const saved = await svc.update(user, {
      key, etag: obj.header.__etag, header: { ...obj.header, name: 'Renamed deal' },
      items: { flows: [{ ...f1, amount: '999' }, f3, { seq: '9', payDate: '2030-01-01', flowType: 'FEE', amount: '10', currency: 'INR' }] }
    });
    expect(batches(sap)).toHaveLength(1);
    const body = batches(sap)[0].body;
    expect(body).toMatch(/PATCH Deal\(Deal='0000010002'\) HTTP\/1\.1[\s\S]*?If-Match: W\/"\d+"/);
    expect(body).toContain('{"Name":"Renamed deal"}');
    expect(body).toContain("POST Deal(Deal='0000010002')/_Flows HTTP/1.1");
    expect(body).toContain("PATCH DealFlow(Deal='0000010002',Seq=1) HTTP/1.1");
    expect(body).toContain("DELETE DealFlow(Deal='0000010002',Seq=2) HTTP/1.1");
    expect(body).not.toContain('Seq=3');
    // The header (with the ETag the person saw) first; within the tab deletes before updates before creates.
    // Items send their own ETag from the server's fresh read.
    const flows = Object.fromEntries(obj.items.flows.map(f => [f.seq, f.__etag]));
    expect(operations(body)).toEqual([
      { line: "PATCH Deal(Deal='0000010002')", ifMatch: obj.header.__etag },
      { line: "DELETE DealFlow(Deal='0000010002',Seq=2)", ifMatch: flows['2'] },
      { line: "PATCH DealFlow(Deal='0000010002',Seq=1)", ifMatch: flows['1'] },
      { line: "POST Deal(Deal='0000010002')/_Flows", ifMatch: undefined }
    ]);
    expect(saved.header.name).toBe('Renamed deal');
    expect(saved.items.flows.map(f => [f.seq, f.amount])).toEqual([['1', '999.00'], ['3', f3.amount], ['9', '10.00']]);
  });

  it('creates header and items in one deep insert and returns the key SAP assigned', async () => {
    const created = await objectService(cfg, 'sample-deals').create(user, {
      header: { name: 'New deal', product: '51A', counterparty: 'CP001', amount: '50,00,000', currency: 'INR', start: '2026-04-01', end: '2031-03-31', rate: '7.5', remarks: '' },
      items: { flows: [{ seq: '1', payDate: '2026-10-01', flowType: 'INT', amount: '1,87,500', currency: 'INR' }] }
    });
    expect(batches(sap)).toHaveLength(1);
    const body = batches(sap)[0].body;
    expect(body).toContain('POST Deal HTTP/1.1');
    expect(body).toContain('"_Flows":[{"Seq":1,"PayDate":"2026-10-01","FlowType":"INT","Amount":187500,"Currency":"INR"}]');
    expect(body).not.toContain('"Deal":');
    expect(created.header.deal).toBe('0000010021');
    expect(created.items.flows).toHaveLength(1);
  });

  it('refuses a save when someone changed the deal since it was opened (409), also on a second try', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010003' };
    const obj = await svc.read(user, key);
    const stored = sap.sets.Deal.rows.find(r => r.Deal === key.deal);
    if (stored) stored['@odata.etag'] = 'W/"9999"'; // someone else saved
    const attempt = () => svc.update(user, { key, etag: obj.header.__etag, header: { ...obj.header, name: 'Mine' }, items: obj.items });
    await expect(attempt()).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    await expect(attempt()).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    expect(batches(sap)).toHaveLength(0);
    const fresh = await svc.read(user, key);
    const saved = await svc.update(user, { key, etag: fresh.header.__etag, header: { ...fresh.header, name: 'Mine' }, items: fresh.items });
    expect(saved.header.name).toBe('Mine');
  });

  it('refuses a stale save that changes items only (409), before anything is sent', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010003' };
    const obj = await svc.read(user, key);
    const stored = sap.sets.Deal.rows.find(r => r.Deal === key.deal);
    if (stored) stored['@odata.etag'] = 'W/"9999"';
    const [f1, ...rest] = obj.items.flows;
    await expect(svc.update(user, { key, etag: obj.header.__etag, header: obj.header, items: { flows: [{ ...f1, amount: '1' }, ...rest] } }))
      .rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    expect(batches(sap)).toHaveLength(0);
  });

  it('refuses a write without the ETag the person saw (400), so the conflict check is never skipped', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010003' };
    const obj = await svc.read(user, key);
    await expect(svc.update(user, { key, header: { ...obj.header, name: 'Mine' }, items: obj.items })).rejects.toMatchObject({ status: 400, message: 'Refresh and try again.' });
    await expect(svc.remove(user, { key, etag: '' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.action(user, 'release', { key })).rejects.toMatchObject({ status: 400 });
    expect(batches(sap)).toHaveLength(0);
  });

  it('refuses part of the items when SAP pages an expanded collection (502)', async () => {
    await sap.close();
    sap = await startMockSap({ sets: dealSets(), expandPageSize: 2 });
    setMockRelay(sap);
    await expect(objectService(cfg, 'sample-deals').read(user, { deal: '0000010002' }))
      .rejects.toMatchObject({ status: 502, message: expect.stringContaining('only part of the flows items') });
  });

  it('requires the navigation of every items tab in a contract with object', () => {
    register('sample-deals-nonav', { object: { items: {} } });
    expect(() => objectService(cfg, 'sample-deals-nonav')).toThrow(/no navigation for the items tab flows/);
  });

  describe('items that share the header ETag (itemEtag parent)', () => {
    beforeEach(async () => {
      await sap.close();
      const sets = dealSets();
      sets.DealFlow.etagFromParent = true;
      sap = await startMockSap({ sets });
      setMockRelay(sap);
      register('sample-deals-parent', PARENT_ETAG);
    });

    it('checks the seen ETag on the first conditional operation and sends * after it; item POSTs carry none', async () => {
      const svc = objectService(cfg, 'sample-deals-parent');
      const key = { deal: '0000010002' };
      const obj = await svc.read(user, key);
      expect(obj.items.flows.every(f => f.__etag === obj.header.__etag)).toBe(true);
      const [f1, , f3] = obj.items.flows;
      const saved = await svc.update(user, {
        key, etag: obj.header.__etag, header: { ...obj.header, name: 'Renamed deal' },
        items: { flows: [{ ...f1, amount: '999' }, f3, { seq: '9', payDate: '2030-01-01', flowType: 'FEE', amount: '10', currency: 'INR' }] }
      });
      expect(operations(batches(sap)[0].body)).toEqual([
        { line: "PATCH Deal(Deal='0000010002')", ifMatch: obj.header.__etag },
        { line: "DELETE DealFlow(Deal='0000010002',Seq=2)", ifMatch: '*' },
        { line: "PATCH DealFlow(Deal='0000010002',Seq=1)", ifMatch: '*' },
        { line: "POST Deal(Deal='0000010002')/_Flows", ifMatch: undefined }
      ]);
      expect(saved.items.flows.map(f => [f.seq, f.amount])).toEqual([['1', '999.00'], ['3', f3.amount], ['9', '10.00']]);
    });

    it('without a header change, the first item operation checks the seen header ETag', async () => {
      const svc = objectService(cfg, 'sample-deals-parent');
      const key = { deal: '0000010002' };
      const obj = await svc.read(user, key);
      const [f1, f2] = obj.items.flows;
      await svc.update(user, { key, etag: obj.header.__etag, header: obj.header, items: { flows: [{ ...f1, amount: '5' }, { ...f2, amount: '6' }] } });
      expect(operations(batches(sap)[0].body)).toEqual([
        { line: "DELETE DealFlow(Deal='0000010002',Seq=3)", ifMatch: obj.header.__etag },
        { line: "PATCH DealFlow(Deal='0000010002',Seq=1)", ifMatch: '*' },
        { line: "PATCH DealFlow(Deal='0000010002',Seq=2)", ifMatch: '*' }
      ]);
    });

    it("the 'own' mode would fail on such a service: the header change makes the items' ETag stale (409)", async () => {
      const svc = objectService(cfg, 'sample-deals');
      const key = { deal: '0000010002' };
      const obj = await svc.read(user, key);
      const [f1, ...rest] = obj.items.flows;
      await expect(svc.update(user, { key, etag: obj.header.__etag, header: { ...obj.header, name: 'X' }, items: { flows: [{ ...f1, amount: '5' }, ...rest] } }))
        .rejects.toMatchObject({ status: 409 });
    });
  });

  it("turns SAP's 412 into a 409 and changes nothing", async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010004' };
    const obj = await svc.read(user, key);
    sap.failNext(412, 'The entry was changed by another user', 'POST');
    await expect(svc.update(user, { key, etag: obj.header.__etag, header: { ...obj.header, name: 'Mine' }, items: obj.items })).rejects.toMatchObject({ status: 409, message: CONFLICT_MESSAGE });
    expect(sap.sets.Deal.rows.find(r => r.Deal === key.deal)?.Name).toBe(obj.header.name);
  });

  it('refuses invalid deals with problems on their fields and item rows (422)', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const obj = await svc.read(user, key);
    const [f1] = obj.items.flows;
    await expect(svc.update(user, { key, etag: obj.header.__etag, header: { ...obj.header, amount: '' }, items: { flows: [f1, { ...f1 }] } }))
      .rejects.toMatchObject({ status: 422, details: expect.arrayContaining([{ field: 'amount', message: 'Amount is required' }, { tab: 'flows', row: 2, field: 'seq', message: "No. '1' is used twice." }]) });
    expect(batches(sap)).toHaveLength(0);
  });

  it('deletes with If-Match; SAP removes the cash flows too', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010005' };
    const obj = await svc.read(user, key);
    expect(await svc.remove(user, { key, etag: obj.header.__etag })).toEqual({ deleted: true });
    expect(batches(sap)[0].body).toMatch(/DELETE Deal\(Deal='0000010005'\) HTTP\/1\.1[\s\S]*?If-Match: W\//);
    expect(sap.sets.DealFlow.rows.some(r => r.Deal === key.deal)).toBe(false);
    await expect(svc.read(user, key)).rejects.toMatchObject({ status: 404 });
  });

  it('never runs applyItems for a SAP action', async () => {
    const applyItems = vi.fn(() => ({}));
    const release = deals.actions!.find(x => x.id === 'release')!;
    SERVER_MODULES['sap-items-only'] = { def: { ...deals, id: 'sap-items-only', actions: [{ ...release, applyItems }] }, contract, seed: () => dealsSeed(20), source: 'sap' };
    const svc = objectService(cfg, 'sap-items-only');
    const key = { deal: '0000010001' };
    const obj = await svc.read(user, key);
    expect((await svc.action(user, 'release', { key, etag: obj.header.__etag })).header.status).toBe('R');
    expect(applyItems).not.toHaveBeenCalled();
  });

  it('runs a bound action only when it applies', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const obj = await svc.read(user, key);
    const released = await svc.action(user, 'release', { key, etag: obj.header.__etag });
    expect(released.header.status).toBe('R');
    expect(batches(sap)[0].body).toContain(`POST Deal(Deal='0000010001')/${RELEASE} HTTP/1.1`);
    await expect(svc.action(user, 'release', { key, etag: released.header.__etag })).rejects.toMatchObject({ status: 422 });
    await expect(svc.action(user, 'nope', { key, etag: released.header.__etag })).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an action whose check fails (422 on the field) before SAP is asked", async () => {
    const release = { ...deals.actions![0], inputs: [REASON], check: (_h: Row, v: Row): Record<string, string> => (v.reason === 'No' ? { reason: 'Give a real reason.' } : {}) };
    SERVER_MODULES['test-deals-sap-check'] = { def: { ...deals, id: 'test-deals-sap-check', actions: [release] }, contract, seed: () => dealsSeed(20), source: 'sap' };
    const svc = objectService(cfg, 'test-deals-sap-check');
    const key = { deal: '0000010001' };
    const obj = await svc.read(user, key);
    await expect(svc.action(user, 'release', { key, etag: obj.header.__etag, values: { reason: 'No' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'reason', message: 'Give a real reason.' }] });
    expect(batches(sap)).toHaveLength(0);
  });

  it('runs an SAP action with inputs as before: the bound action, never apply', async () => {
    const release = { ...deals.actions![0], inputs: [REASON], apply: () => ({ remarks: 'never' }) };
    SERVER_MODULES['test-deals-sap-inputs'] = { def: { ...deals, id: 'test-deals-sap-inputs', actions: [release] }, contract, seed: () => dealsSeed(20), source: 'sap' };
    const svc = objectService(cfg, 'test-deals-sap-inputs');
    const key = { deal: '0000010001' };
    const obj = await svc.read(user, key);
    const released = await svc.action(user, 'release', { key, etag: obj.header.__etag, values: { reason: 'Ok' } });
    expect(released.header.status).toBe('R');
    expect(released.header.remarks).not.toBe('never');
    expect(batches(sap)[0].body).toContain(`POST Deal(Deal='0000010001')/${RELEASE} HTTP/1.1`);
  });
});

describe('object pages on the mock store', () => {
  onSampleData('sample-deals');
  let cfg: AppConfig;
  beforeEach(async () => { cfg = freshConfig(); });

  it('creates with the next number, saves, refuses a stale save, releases and deletes', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const created = await svc.create(actingAs(), {
      header: { name: 'Local deal', product: '52A', counterparty: 'CP002', amount: '1000', currency: 'INR', start: '2026-04-01', end: '2027-03-31', rate: '', remarks: '' },
      items: { flows: [{ seq: '1', payDate: '2026-10-01', flowType: 'INT', amount: '75', currency: 'INR' }] }
    });
    expect(created.header.deal).toBe('0000010021');
    expect(created.items.flows).toHaveLength(1);
    const key = { deal: created.header.deal };
    const renamed = await svc.update(actingAs(), { key, etag: created.header.__etag, header: { ...created.header, name: 'Renamed' }, items: created.items });
    expect(renamed.header.name).toBe('Renamed');
    await expect(svc.update(actingAs(), { key, etag: created.header.__etag, header: { ...created.header, name: 'Stale' }, items: created.items })).rejects.toMatchObject({ status: 409 });
    expect((await svc.update(actingAs(), { key, etag: renamed.header.__etag, header: renamed.header, items: renamed.items })).unchanged).toBe(true);
    const released = await svc.action(actingAs(), 'release', { key, etag: renamed.header.__etag });
    expect(released.header.status).toBe('R');
    await expect(svc.remove(actingAs(), { key, etag: '' })).rejects.toMatchObject({ status: 400 });
    await svc.remove(actingAs(), { key, etag: released.header.__etag });
    await expect(svc.read(actingAs(), key)).rejects.toMatchObject({ status: 404 });
  });

  it('detects the first concurrent save of a seeded deal', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const mine = await svc.read(actingAs(), key), theirs = await svc.read(actingAs(), key);
    expect(mine.header.__etag).toBeTruthy();
    await svc.update(actingAs(), { key, etag: theirs.header.__etag, header: { ...theirs.header, name: 'Theirs' }, items: theirs.items });
    await expect(svc.update(actingAs(), { key, etag: mine.header.__etag, header: { ...mine.header, name: 'Mine' }, items: mine.items }))
      .rejects.toMatchObject({ status: 409 });
  });
  it('keeps the items of a tab that is missing from the save or not editable', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const obj = await svc.read(actingAs(), key);
    const renamed = await svc.update(actingAs(), { key, etag: obj.header.__etag, header: { ...obj.header, name: 'No items sent' } });
    expect(renamed.header.name).toBe('No items sent');
    expect(renamed.items.flows.map(f => f.seq)).toEqual(obj.items.flows.map(f => f.seq));
    SERVER_MODULES['test-deals-locked'] = { def: { ...deals, id: 'test-deals-locked', tabs: deals.tabs.map(t => (t.kind === 'items' ? { ...t, editable: false } : t)) }, contract, seed: () => dealsSeed(20) };
    const locked = objectService(cfg, 'test-deals-locked');
    const mine = await locked.read(actingAs(), key);
    const out = await locked.update(actingAs(), { key, etag: mine.header.__etag, header: mine.header, items: { flows: [{ ...mine.items.flows[0], amount: '1' }] } });
    expect(out.unchanged).toBe(true);
    expect((await locked.read(actingAs(), key)).items.flows).toEqual(mine.items.flows);
  });
});

describe('record actions that ask for input', () => {
  const key = { deal: '0000010001' };

  it('app data: runs apply with the values and saves through the update path (new ETag, stale refused)', async () => {
    const svc = variant('test-deals-extend', 'app', { actions: [EXTEND] });
    const obj = await svc.read(actingAs(), key);
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'Renewed' } });
    expect(after.header).toMatchObject({ end: '2099-12-31', remarks: 'Renewed', name: obj.header.name });
    expect(after.header.__etag).not.toBe(obj.header.__etag);
    expect(after.items.flows).toEqual(obj.items.flows);
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2098-12-31' } })).rejects.toMatchObject({ status: 409 });
    await expect(svc.action(actingAs(), 'extend', { key, values: { newEnd: '2098-12-31' } })).rejects.toMatchObject({ status: 400 });
  });

  it('checks the values by the input fields first (422 on the field), and changes nothing', async () => {
    const svc = variant('test-deals-extend', 'app', { actions: [EXTEND] });
    const obj = await svc.read(actingAs(), key);
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { reason: 'x' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'newEnd', message: 'New End Date is required' }] });
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'A reason far longer than twenty' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'reason' }] });
    expect((await svc.read(actingAs(), key)).header).toEqual(obj.header);
  });

  it('refuses an apply that leaves the record invalid (422 with the problem), as a save would', async () => {
    const svc = variant('test-deals-extend', 'app', { actions: [EXTEND] });
    const obj = await svc.read(actingAs(), key);
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '1990-01-01' } }))
      .rejects.toMatchObject({ status: 422, message: 'Extend would leave the deal invalid.', details: [{ message: 'Validity: the end date must not be before the start date.' }] });
    expect((await svc.read(actingAs(), key)).header).toEqual(obj.header);
  });

  it('refuses an apply that changes a field the record does not save (500), instead of losing the change', async () => {
    const svc = variant('test-deals-extend', 'app', { actions: [{ ...EXTEND, apply: h => ({ ...h, status: 'X' }) }] });
    const obj = await svc.read(actingAs(), key);
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31' } }))
      .rejects.toMatchObject({ status: 500, message: expect.stringContaining('status') });
    expect((await svc.read(actingAs(), key)).header).toEqual(obj.header);
  });

  it('sample data: runs mock(header, values) when the action has one', async () => {
    const svc = variant('test-deals-extend-mock', undefined, { actions: [{ ...EXTEND, apply: undefined, mock: (h, v) => ({ ...h, remarks: `mock ${v.reason}` }) }] });
    const obj = await svc.read(actingAs(), key);
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'R' } });
    expect(after.header.remarks).toBe('mock R');
    expect(after.header.end).toBe(obj.header.end);
  });

  it('sample data: without a mock, runs apply through the update path', async () => {
    const svc = variant('test-deals-extend-sample', undefined, { actions: [EXTEND] });
    const obj = await svc.read(actingAs(), key);
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'S' } });
    expect(after.header).toMatchObject({ end: '2099-12-31', remarks: 'S' });
  });

  it("re-runs the action's check on the stored header (422 on the field) before apply, and changes nothing", async () => {
    const svc = variant('test-deals-check', 'app', { actions: [LOGGED_EXTEND] });
    const obj = await svc.read(actingAs(), key);
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: obj.header.end, reason: 'Same' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'newEnd', message: 'New End Date must be after the current end date.' }] });
    expect(await svc.read(actingAs(), key)).toEqual(obj);
  });

  it('applyItems: the rows are saved with the header change in one write (the seen ETag), cleaned, only for items tabs', async () => {
    const id = 'test-deals-apply-items';
    const svc = variant(id, 'app', { actions: [LOGGED_EXTEND] });
    appliedBy.length = 0;
    const obj = await svc.read(actingAs(), key);
    const writes = vi.spyOn(backendFor(id, SERVER_MODULES[id]), 'writeObject');
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'Renewed' } });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(appliedBy).toEqual(['demo']);
    const w = writes.mock.calls[0][2];
    expect(w).toMatchObject({ op: 'update', etag: obj.header.__etag, header: { end: '2099-12-31', remarks: 'Renewed' } });
    expect(w.items.map(i => [i.tab, i.op, i.key])).toEqual([['flows', 'create', { seq: '99' }]]);
    const flowGrid = deals.tabs.flatMap(t => (t.kind === 'items' ? t.grid : []));
    const added = after.items.flows.find(f => f.seq === '99');
    expect(added).toMatchObject({ payDate: '2099-12-31', flowType: 'FEE', amount: cleanValues(flowGrid, { amount: '1,000' }).amount, currency: obj.header.currency });
    expect(added).not.toHaveProperty('changedBy');
    expect(after.items.flows).toHaveLength(obj.items.flows.length + 1);
    expect(after.header.end).toBe('2099-12-31');
    writes.mockRestore();
    // The stale ETag the person saw refuses the header and the rows together.
    await expect(svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2100-12-31', reason: 'Again' } })).rejects.toMatchObject({ status: 409 });
    expect((await svc.read(actingAs(), key)).items.flows).toHaveLength(obj.items.flows.length + 1);
  });

  it('applyItems replaces the rows of an items tab that is not editable too', async () => {
    const tabs = deals.tabs.map(t => (t.kind === 'items' ? { ...t, editable: false } : t));
    const svc = variant('test-deals-apply-locked', 'app', { tabs, actions: [LOGGED_EXTEND] });
    const obj = await svc.read(actingAs(), key);
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31', reason: 'R' } });
    expect(after.items.flows.map(f => f.seq)).toEqual([...obj.items.flows.map(f => f.seq), '99']);
  });

  it('applyItems that gives a tab something other than rows changes nothing there (never throws)', async () => {
    const odd: ObjectAction = { ...EXTEND, applyItems: () => ({ flows: 'not rows' as unknown as Row[] }) };
    const svc = variant('test-deals-apply-odd', 'app', { actions: [odd] });
    const obj = await svc.read(actingAs(), key);
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31' } });
    expect(after.header.end).toBe('2099-12-31');
    expect(after.items.flows).toEqual(obj.items.flows);
    const none = variant('test-deals-apply-none', 'app', { actions: [{ ...EXTEND, applyItems: () => null as unknown as Record<string, Row[]> }] });
    const again = await none.read(actingAs(), key);
    expect((await none.action(actingAs(), 'extend', { key, etag: again.header.__etag, values: { newEnd: '2099-12-31' } })).items.flows).toEqual(again.items.flows);
  });

  it.each([['app data', 'app' as const], ['sample data without a mock', undefined]])('applyItems without apply saves the rows on %s (header unchanged, one write)', async (_name, source) => {
    const id = `test-deals-items-only-${source ?? 'sample'}`;
    const base: ObjectAction = { ...EXTEND, apply: undefined, mock: undefined };
    const only: ObjectAction = { ...base, applyItems: (_h, items, _v, user) => ({ flows: [...(items.flows ?? []), { seq: '98', payDate: '2099-01-01', flowType: 'FEE', amount: '5', currency: 'EUR', changedBy: user }] }) };
    const svc = variant(id, source, { actions: [only] });
    const obj = await svc.read(actingAs(), key);
    const writes = vi.spyOn(backendFor(id, SERVER_MODULES[id]), 'writeObject');
    const after = await svc.action(actingAs(), 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31' } });
    expect(writes).toHaveBeenCalledTimes(1);
    expect(after.items.flows.map(f => f.seq)).toEqual([...obj.items.flows.map(f => f.seq), '98']);
    expect(after.header.end).toBe(obj.header.end);
    expect(after.header.__etag).not.toBe(obj.header.__etag);
    writes.mockRestore();
  });

  it('an old action (no inputs, no apply) still runs its mock on the header', async () => {
    const svc = variant('test-deals-old', 'app', {});
    const obj = await svc.read(actingAs(), key);
    expect((await svc.action(actingAs(), 'release', { key, etag: obj.header.__etag })).header.status).toBe('R');
  });
});

describe('per-record locks', () => {
  const key = { deal: '0000010001' };
  const notReleased = (h: Row) => h.status !== 'R';

  it('refuses an update while editableWhen is false (422); an action still runs by its own `when`', async () => {
    const svc = variant('test-deals-lock', 'app', { editableWhen: notReleased, actions: [...deals.actions!, EXTEND] });
    const obj = await svc.read(actingAs(), key);
    const renamed = await svc.update(actingAs(), { key, etag: obj.header.__etag, header: { ...obj.header, name: 'Open' } });
    const released = await svc.action(actingAs(), 'release', { key, etag: renamed.header.__etag });
    await expect(svc.update(actingAs(), { key, etag: released.header.__etag, header: { ...released.header, name: 'Locked' } }))
      .rejects.toMatchObject({ status: 422, message: 'This deal can no longer be changed.' });
    expect((await svc.read(actingAs(), key)).header.name).toBe('Open');
    const extended = await svc.action(actingAs(), 'extend', { key, etag: released.header.__etag, values: { newEnd: '2099-12-31' } });
    expect(extended.header.end).toBe('2099-12-31');
  });

  it('lockedFields: an edit that changes a locked field is refused on it (422); other fields and actions still change', async () => {
    const svc = variant('test-deals-lockfields', 'app', { lockedFields: (h: Row) => (h.status === 'R' ? ['end'] : []), actions: [...deals.actions!, EXTEND] });
    const obj = await svc.read(actingAs(), key);
    const moved = await svc.update(actingAs(), { key, etag: obj.header.__etag, header: { ...obj.header, end: '2098-12-31' } });
    expect(moved.header.end).toBe('2098-12-31');
    const released = await svc.action(actingAs(), 'release', { key, etag: moved.header.__etag });
    await expect(svc.update(actingAs(), { key, etag: released.header.__etag, header: { ...released.header, end: '2097-12-31' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'end', message: 'Validity To cannot be changed for this deal now.' }] });
    expect((await svc.read(actingAs(), key)).header.end).toBe('2098-12-31');
    const renamed = await svc.update(actingAs(), { key, etag: released.header.__etag, header: { ...released.header, name: 'Still open' } });
    expect(renamed.header.name).toBe('Still open');
    const extended = await svc.action(actingAs(), 'extend', { key, etag: renamed.header.__etag, values: { newEnd: '2099-12-31' } });
    expect(extended.header.end).toBe('2099-12-31');
  });

  it('refuses a delete while deletableWhen is false (422), and deletes while true', async () => {
    const svc = variant('test-deals-nodelete', 'app', { deletableWhen: notReleased });
    const obj = await svc.read(actingAs(), key);
    const released = await svc.action(actingAs(), 'release', { key, etag: obj.header.__etag });
    await expect(svc.remove(actingAs(), { key, etag: released.header.__etag })).rejects.toMatchObject({ status: 422, message: 'This deal cannot be deleted.' });
    expect((await svc.read(actingAs(), key)).header.status).toBe('R');
    const other = { deal: '0000010002' };
    const open = await svc.read(actingAs(), other);
    await svc.remove(actingAs(), { key: other, etag: open.header.__etag });
    await expect(svc.read(actingAs(), other)).rejects.toMatchObject({ status: 404 });
  });
});

describe('header fields the server sets on create (initial)', () => {
  const STATUS_FIELD: FieldDef = { field: 'status', label: 'Status *', type: 'select', options: [{ value: 'N', label: 'New' }, { value: 'D', label: 'Draft' }], required: true };
  const typed = { name: 'Initial deal', product: '52A', counterparty: 'CP002', amount: '1000', currency: 'INR', start: '2026-04-01', end: '2027-03-31', rate: '', remarks: 'Typed' };

  it('overrides the typed values, and a required field it sets is not a problem', async () => {
    const svc = variant('test-deals-initial', 'app', { header: [...deals.header, STATUS_FIELD], initial: () => ({ status: 'D', remarks: 'Set by the server' }) });
    const created = await svc.create(actingAs(), { header: { ...typed, status: 'N' } });
    expect(created.header).toMatchObject({ name: 'Initial deal', status: 'D', remarks: 'Set by the server' });
    const blank = await svc.create(actingAs(), { header: typed });
    expect(blank.header.status).toBe('D');
  });

  it('without initial the same required field is refused (422), and old definitions save what was typed', async () => {
    const svc = variant('test-deals-no-initial', 'app', { header: [...deals.header, STATUS_FIELD] });
    await expect(svc.create(actingAs(), { header: typed })).rejects.toMatchObject({ status: 422, details: [{ field: 'status', message: 'Status is required' }] });
    const old = await variant('test-deals-plain', 'app', {}).create(actingAs(), { header: typed });
    expect(old.header.remarks).toBe('Typed');
  });

  it('cleans what initial sets by the header fields and drops keys that are not header fields', async () => {
    const svc = variant('test-deals-initial-clean', 'app', { header: [...deals.header, STATUS_FIELD], initial: () => ({ status: 'D', rate: '7.5', bogus: 'x' }) });
    const created = await svc.create(actingAs(), { header: typed });
    const terms = deals.tabs.flatMap(t => (t.kind === 'fields' ? t.groups.flatMap(g => g.fields) : []));
    expect(created.header.rate).toBe(cleanValues(terms, { rate: '7.5' }).rate);
    expect(created.header).not.toHaveProperty('bogus');
  });

  it('a field initial sets is locked on update (422); an action still changes it', async () => {
    const activate: ObjectAction = { id: 'activate', label: 'Activate', sapAction: 'Activate', confirm: 'Activate this deal?', when: h => h.status === 'D', apply: () => ({ status: 'N' }) };
    const svc = variant('test-deals-initial-lock', 'app', { header: [...deals.header, STATUS_FIELD], initial: () => ({ status: 'D' }), actions: [activate] });
    const created = await svc.create(actingAs(), { header: typed });
    const key = { deal: created.header.deal };
    await expect(svc.update(actingAs(), { key, etag: created.header.__etag, header: { ...created.header, status: 'N' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'status', message: 'Status cannot be changed for this deal now.' }] });
    const renamed = await svc.update(actingAs(), { key, etag: created.header.__etag, header: { ...created.header, name: 'Renamed' } });
    expect(renamed.header).toMatchObject({ name: 'Renamed', status: 'D' });
    const active = await svc.action(actingAs(), 'activate', { key, etag: renamed.header.__etag });
    expect(active.header.status).toBe('N');
  });
});

