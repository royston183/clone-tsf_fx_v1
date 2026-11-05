// Items whose keys SAP assigns (items tab `keyBySap`): new rows have no key yet, so each is its own create, and the
// POST to the header's navigation leaves the empty key fields out (SAP's early numbering fills them).
import type { Actor } from '@core/actor';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { objectService } from '@core/server/object-service';
import { diffObject } from '@/lib/object/object';
import type { Row } from '@/lib/grid/types';
import { SERVER_MODULES } from '@/modules/server-registry';
import type { ObjectModuleDef, ODataContract } from '@/modules/types';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap } from '../support/mock-sap';

installTestPlatform();

const def: ObjectModuleDef<Record<string, never>> = {
  kind: 'object', id: 'test-tf-split', title: 'TF', noun: ['TF', 'TFs'], serviceKey: 'tradeflow', storageKey: 'test-tf-split', internal: true,
  opens: { create: 'page', open: 'page' }, keyBySap: true, canCreate: false, canDelete: false,
  list: { entity: 'tradeflows', keys: ['tfNo', 'tfDate'], columns: [], fields: [{ field: 'tfNo', label: 'TF No', type: 'code', max: 10, key: true }, { field: 'tfDate', label: 'TF Date', type: 'date', key: true }], defaultSort: { field: 'tfNo', dir: 1 } },
  header: [{ field: 'tfNo', label: 'TF No', type: 'code', max: 10, key: true }, { field: 'tfDate', label: 'TF Date', type: 'date', key: true }, { field: 'quantity', label: 'Quantity', type: 'decimal', scale: 3 }],
  tabs: [{
    kind: 'items', id: 'bl', label: 'BLs', table: 'bl', keys: ['blNo', 'blRecordDate'], keyBySap: true, editable: true, columns: [],
    grid: [{ field: 'blNo', label: 'BL No', type: 'code', max: 10 }, { field: 'blRecordDate', label: 'BL Record Date', type: 'date' }, { field: 'quantity', label: 'Quantity', type: 'decimal', scale: 3 }, { field: 'deletedFlag', label: 'Deleted', type: 'code', max: 1 }]
  }],
  lookups: () => ({})
};
const contract: ODataContract = {
  service: 'ZFS_SB_TRADEFLOW_O4_API', naming: 'pascal', etag: true, numbers: ['quantity'], keyTypes: { tfDate: 'date', blRecordDate: 'date' },
  tables: { tradeflows: { entitySet: 'TradeFlow' }, bl: { entitySet: 'BillOfLading' } },
  object: { items: { bl: { navigation: '_BillOfLading' } }, itemEtag: 'parent' }
};
const header: Row = { tfNo: '3000000015', tfDate: '2026-11-05', quantity: '100.000' };
const oldBl: Row = { tfNo: '3000000015', tfDate: '2026-11-05', blNo: '4000000012', blRecordDate: '2026-11-05', quantity: '100.000', deletedFlag: '' };
const seed = () => ({ tables: { tradeflows: [{ ...header }], bl: [{ ...oldBl }] } });

describe('items tabs with keys SAP assigns (keyBySap)', () => {
  beforeAll(() => { SERVER_MODULES[def.id] = { def, contract, seed, source: 'sap' }; });

  it('plans every new row without a key as its own create, next to the change of the old row', () => {
    const after: { header: Row; items: Record<string, Row[]> } = { header, items: { bl: [{ ...oldBl, deletedFlag: 'X' }, { blNo: '', blRecordDate: '', quantity: '60' }, { blNo: '', blRecordDate: '', quantity: '40' }] } };
    const d = diffObject(def, { header, items: { bl: [oldBl] } }, after);
    expect(d.items.map(c => [c.op, c.data.quantity ?? '', c.data.deletedFlag ?? ''])).toEqual([['update', '', 'X'], ['create', '60.000', ''], ['create', '40.000', '']]);
    expect(d.counts.bl).toEqual({ created: 2, updated: 1, deleted: 0 });
  });

  describe('on SAP', () => {
    let sap: MockSap;
    let cfg: AppConfig;
    let user: Actor;
    beforeEach(async () => {
      user = actingAs(newSapConnection('TESTER', 'secret'));
      let bl = 4000000012;
      sap = await startMockSap({ sets: {
        TradeFlow: { key: 'TfNo', keys: ['TfNo', 'TfDate'], rows: [{ TfNo: header.tfNo, TfDate: header.tfDate, Quantity: 100 }], nav: { _BillOfLading: { set: 'BillOfLading', link: { TfNo: 'TfNo', TfDate: 'TfDate' } } } },
        BillOfLading: { key: 'BlNo', keys: ['BlNo', 'BlRecordDate'], etagFromParent: true, autoKey: () => String(++bl), rows: [{ TfNo: header.tfNo, TfDate: header.tfDate, BlNo: oldBl.blNo, BlRecordDate: oldBl.blRecordDate, Quantity: 100, DeletedFlag: '' }] }
      } });
      cfg = relayConfig(sap);
    });
    afterEach(async () => { await sap.close(); });

    it('posts each new BL to the navigation without BlNo or BlRecordDate, after flagging the old one', async () => {
      const svc = objectService(cfg, def.id);
      const obj = await svc.read(user, { tfNo: header.tfNo, tfDate: header.tfDate });
      await svc.update(user, { key: { tfNo: header.tfNo, tfDate: header.tfDate }, etag: obj.header.__etag, header: obj.header, items: { bl: [{ ...obj.items.bl[0], deletedFlag: 'X' }, { blNo: '', blRecordDate: '', quantity: '60' }, { blNo: '', blRecordDate: '', quantity: '40' }] } });
      const body = sap.log.filter(r => r.rel === '$batch').map(r => r.body).join('\n');
      expect(body).toContain("PATCH BillOfLading(BlNo='4000000012',BlRecordDate=2026-11-05)");
      const posts = [...body.matchAll(/POST TradeFlow\(TfNo='3000000015',TfDate=2026-11-05\)\/_BillOfLading HTTP\/1\.1\r\n(?:[^\r\n]+\r\n)*\r\n(\{.*\})/g)].map(m => JSON.parse(m[1]) as Record<string, unknown>);
      expect(posts.map(p => p.Quantity)).toEqual([60, 40]);
      for (const p of posts) { expect(p).not.toHaveProperty('BlNo'); expect(p).not.toHaveProperty('BlRecordDate'); }
    });
  });

  describe('on sample data', () => {
    onSampleData(def.id);
    it('numbers each new BL itself', async () => {
      const svc = objectService(freshConfig(), def.id);
      const obj = await svc.read(actingAs(), { tfNo: header.tfNo, tfDate: header.tfDate });
      const saved = await svc.update(actingAs(), { key: { tfNo: header.tfNo, tfDate: header.tfDate }, etag: obj.header.__etag, header: obj.header, items: { bl: [{ ...obj.items.bl[0], deletedFlag: 'X' }, { blNo: '', blRecordDate: '', quantity: '60' }, { blNo: '', blRecordDate: '', quantity: '40' }] } });
      const nos = saved.items.bl.map(b => b.blNo);
      expect(new Set(nos).size).toBe(3);
      expect(nos.every(Boolean)).toBe(true);
      expect(saved.items.bl.filter(b => b.deletedFlag !== 'X').map(b => b.quantity)).toEqual(['60.000', '40.000']);
    });
  });
});
