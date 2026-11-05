// tests/integration/object-service.test.ts
// The object service over the BackEnd's database: Deals is the template's `app` module. Objects on SAP are tested in
// the FrontEnd (FrontEnd/tests/unit/object-service.test.ts), where the browser runs them.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '@core/actor';
import type { AppConfig } from '@core/server/config';
import { objectService } from '@core/server/object-service';
import { contract } from '@/modules/samples/deals/contract';
import { deals } from '@/modules/samples/deals/definition';
import { dealsSeed } from '@/modules/samples/deals/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { Row } from '@/lib/grid/types';
import type { ObjectAction } from '@/modules/types';
import { freshStore, testConfig } from '../support/config';

const actor: Actor = { id: 'DEMO', username: 'DEMO', sap: null };

// Twenty sample deals, so the next number is known.
beforeAll(() => { SERVER_MODULES['sample-deals'] = { def: deals, contract, seed: () => dealsSeed(20), source: 'app' }; });

describe('object pages of an app module (the BackEnd database)', () => {
  let cfg: AppConfig;
  beforeEach(() => { freshStore(); cfg = testConfig(); });

  it('creates with the next number, saves, refuses a stale save, releases and deletes', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const created = await svc.create(actor, {
      header: { name: 'Local deal', product: '52A', counterparty: 'CP002', amount: '1000', currency: 'INR', start: '2026-04-01', end: '2027-03-31', rate: '', remarks: '' },
      items: { flows: [{ seq: '1', payDate: '2026-10-01', flowType: 'INT', amount: '75', currency: 'INR' }] }
    });
    expect(created.header.deal).toBe('0000010021');
    expect(created.items.flows).toHaveLength(1);
    const key = { deal: created.header.deal };
    const renamed = await svc.update(actor, { key, etag: created.header.__etag, header: { ...created.header, name: 'Renamed' }, items: created.items });
    expect(renamed.header.name).toBe('Renamed');
    await expect(svc.update(actor, { key, etag: created.header.__etag, header: { ...created.header, name: 'Stale' }, items: created.items })).rejects.toMatchObject({ status: 409 });
    expect((await svc.update(actor, { key, etag: renamed.header.__etag, header: renamed.header, items: renamed.items })).unchanged).toBe(true);
    const released = await svc.action(actor, 'release', { key, etag: renamed.header.__etag });
    expect(released.header.status).toBe('R');
    await expect(svc.remove(actor, { key, etag: '' })).rejects.toMatchObject({ status: 400 });
    await svc.remove(actor, { key, etag: released.header.__etag });
    await expect(svc.read(actor, key)).rejects.toMatchObject({ status: 404 });
  });

  it('detects the first concurrent save of a seeded deal', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const mine = await svc.read(actor, key), theirs = await svc.read(actor, key);
    expect(mine.header.__etag).toBeTruthy();
    await svc.update(actor, { key, etag: theirs.header.__etag, header: { ...theirs.header, name: 'Theirs' }, items: theirs.items });
    await expect(svc.update(actor, { key, etag: mine.header.__etag, header: { ...mine.header, name: 'Mine' }, items: mine.items }))
      .rejects.toMatchObject({ status: 409 });
  });
  it('keeps the items of a tab that is missing from the save or not editable', async () => {
    const svc = objectService(cfg, 'sample-deals');
    const key = { deal: '0000010001' };
    const obj = await svc.read(actor, key);
    const renamed = await svc.update(actor, { key, etag: obj.header.__etag, header: { ...obj.header, name: 'No items sent' } });
    expect(renamed.header.name).toBe('No items sent');
    expect(renamed.items.flows.map(f => f.seq)).toEqual(obj.items.flows.map(f => f.seq));
    SERVER_MODULES['test-deals-locked'] = { def: { ...deals, id: 'test-deals-locked', tabs: deals.tabs.map(t => (t.kind === 'items' ? { ...t, editable: false } : t)) }, contract, seed: () => dealsSeed(20), source: 'app' };
    const locked = objectService(cfg, 'test-deals-locked');
    const mine = await locked.read(actor, key);
    const out = await locked.update(actor, { key, etag: mine.header.__etag, header: mine.header, items: { flows: [{ ...mine.items.flows[0], amount: '1' }] } });
    expect(out.unchanged).toBe(true);
    expect((await locked.read(actor, key)).items.flows).toEqual(mine.items.flows);
  });

  it('runs an action that asks for input through the update path (apply), and keeps per-record locks', async () => {
    const extend: ObjectAction = {
      id: 'extend', label: 'Extend', sapAction: 'Extend', confirm: 'Extend this deal.',
      inputs: [{ field: 'newEnd', label: 'New End Date *', type: 'date', required: true }],
      apply: (_h, v) => ({ end: v.newEnd, remarks: 'Extended' })
    };
    SERVER_MODULES['test-deals-extend'] = {
      def: { ...deals, id: 'test-deals-extend', actions: [...(deals.actions ?? []), extend], editableWhen: (h: Row) => h.status !== 'R', deletableWhen: (h: Row) => h.status !== 'R' },
      contract, seed: () => dealsSeed(20), source: 'app'
    };
    const svc = objectService(cfg, 'test-deals-extend');
    const key = { deal: '0000010001' };
    const obj = await svc.read(actor, key);
    await expect(svc.action(actor, 'extend', { key, etag: obj.header.__etag, values: {} })).rejects.toMatchObject({ status: 422, details: [{ field: 'newEnd' }] });
    await expect(svc.action(actor, 'extend', { key, etag: obj.header.__etag, values: { newEnd: '1990-01-01' } })).rejects.toMatchObject({ status: 422 });
    const extended = await svc.action(actor, 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2099-12-31' } });
    expect(extended.header).toMatchObject({ end: '2099-12-31', remarks: 'Extended' });
    expect(extended.header.__etag).not.toBe(obj.header.__etag);
    await expect(svc.action(actor, 'extend', { key, etag: obj.header.__etag, values: { newEnd: '2098-12-31' } })).rejects.toMatchObject({ status: 409 });
    const released = await svc.action(actor, 'release', { key, etag: extended.header.__etag });
    await expect(svc.update(actor, { key, etag: released.header.__etag, header: { ...released.header, name: 'Locked' } })).rejects.toMatchObject({ status: 422 });
    await expect(svc.remove(actor, { key, etag: released.header.__etag })).rejects.toMatchObject({ status: 422 });
  });

  it("saves an action's items with its header change, re-runs its check, sets initial fields and keeps locked ones", async () => {
    const extend: ObjectAction = {
      id: 'extend', label: 'Extend', sapAction: 'Extend', confirm: 'Extend this deal.',
      inputs: [{ field: 'newEnd', label: 'New End Date *', type: 'date', required: true }],
      check: (h, v): Record<string, string> => (v.newEnd && h.end && v.newEnd <= h.end ? { newEnd: 'New End Date must be after the current end date.' } : {}),
      apply: (_h, v) => ({ end: v.newEnd }),
      applyItems: (h, items, v) => ({ flows: [...(items.flows ?? []), { seq: '99', payDate: v.newEnd, flowType: 'FEE', amount: '1,000', currency: h.currency, note: 'dropped' }] })
    };
    SERVER_MODULES['test-deals-gaps'] = {
      def: { ...deals, id: 'test-deals-gaps', header: [...deals.header, { field: 'status', label: 'Status', type: 'select' as const, options: [{ value: 'N', label: 'New' }, { value: 'R', label: 'Released' }] }], actions: [...(deals.actions ?? []), extend], initial: () => ({ status: 'N', remarks: 'Opened here' }), lockedFields: (h: Row) => (h.status === 'R' ? ['end'] : []) },
      contract, seed: () => dealsSeed(20), source: 'app'
    };
    const svc = objectService(cfg, 'test-deals-gaps');
    const created = await svc.create(actor, { header: { name: 'Gap deal', product: '52A', counterparty: 'CP002', amount: '1000', currency: 'INR', start: '2026-04-01', end: '2027-03-31', rate: '', remarks: 'Typed', status: 'R' } });
    expect(created.header).toMatchObject({ status: 'N', remarks: 'Opened here' });
    const key = { deal: created.header.deal };
    await expect(svc.action(actor, 'extend', { key, etag: created.header.__etag, values: { newEnd: '2027-03-31' } }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'newEnd', message: 'New End Date must be after the current end date.' }] });
    const extended = await svc.action(actor, 'extend', { key, etag: created.header.__etag, values: { newEnd: '2028-03-31' } });
    expect(extended.header.end).toBe('2028-03-31');
    expect(extended.items.flows).toHaveLength(1);
    expect(extended.items.flows[0]).toMatchObject({ seq: '99', payDate: '2028-03-31', flowType: 'FEE' });
    expect(extended.items.flows[0]).not.toHaveProperty('note');
    const released = await svc.action(actor, 'release', { key, etag: extended.header.__etag });
    await expect(svc.update(actor, { key, etag: released.header.__etag, header: { ...released.header, end: '2029-03-31' }, items: released.items }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'end' }] });
    await expect(svc.update(actor, { key, etag: released.header.__etag, header: { ...released.header, status: 'N' }, items: released.items }))
      .rejects.toMatchObject({ status: 422, details: [{ field: 'status' }] });
    const renamed = await svc.update(actor, { key, etag: released.header.__etag, header: { ...released.header, name: 'Renamed' }, items: released.items });
    expect(renamed.header).toMatchObject({ name: 'Renamed', end: '2028-03-31' });
  });
});
