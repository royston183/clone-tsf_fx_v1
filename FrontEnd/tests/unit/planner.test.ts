import { describe, expect, it } from 'vitest';
import { applyLocal, cleanRow, MAX_ROWS, planChanges } from '@/lib/planner';
import { lookups, timeBuckets } from '@/modules/time-buckets/definition';
import seed from '@/modules/time-buckets/seed.json';

const lk = lookups(seed.lookups);
const tab = timeBuckets.tabs[0];
const current = seed.tables.alm1.map(r => ({ ...r, __etag: `W/"${r.bucket}"` }));
const b01 = current[0];
const fresh = { bucket: 'B09', description: '  New   bucket ', xbrlCode: 'X9', fromNo: '1', fromFreq: '03', toNo: '2', toFreq: '03', rbiNo: '9' };

describe('planChanges', () => {
  it('cleans rows like the grid does', () => expect(cleanRow(tab, fresh).description).toBe('New bucket'));
  it('plans creates with the key in the data', () => {
    const plan = planChanges(tab, 'create', [fresh], current, lk);
    expect(plan).toMatchObject({ ok: true, result: { created: 1, updated: 0, deleted: 0, skipped: 0 } });
    if (plan.ok) expect(plan.ops[0]).toMatchObject({ op: 'create', id: 'B09', key: { bucket: 'B09' }, data: { bucket: 'B09', description: 'New bucket', rbiNo: '9' } });
  });
  it('explains every rejected row', () => {
    const plan = planChanges(tab, 'create', [{ ...fresh, bucket: 'B01' }, { ...fresh, description: '' }, { ...fresh, fromNo: 'x' }, { ...fresh, bucket: '' }], current, lk);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.errors).toEqual([
      { row: 1, field: 'bucket', message: "Bucket 'B01' already exists" },
      { row: 2, field: 'description', message: 'Description is required' },
      { row: 3, field: 'bucket', message: "Bucket 'B09' is duplicated in this batch" },
      { row: 4, field: 'bucket', message: 'Bucket is required' }
    ]);
  });
  it('reports invalid numbers', () => {
    const plan = planChanges(tab, 'create', [{ ...fresh, fromNo: '1a' }], current, lk);
    expect(plan.ok ? [] : plan.errors).toEqual([{ row: 1, field: 'fromNo', message: 'From No must be a whole number.' }]);
  });
  it('skips unchanged rows and sends only data plus the ETag on update', () => {
    const plan = planChanges(tab, 'update', [b01, { ...current[1], description: 'Changed' }], current, lk);
    expect(plan).toMatchObject({ ok: true, result: { updated: 1, skipped: 1 } });
    if (plan.ok) {
      expect(plan.ops[0]).toMatchObject({ op: 'update', id: 'B02', key: { bucket: 'B02' }, etag: 'W/"B02"' });
      expect(plan.ops[0].data).not.toHaveProperty('bucket');
      expect(plan.ops[0].data?.description).toBe('Changed');
    }
  });
  it('refuses updates and deletes of rows that no longer exist', () => {
    expect(planChanges(tab, 'update', [{ ...fresh, bucket: 'ZZ' }], current, lk)).toMatchObject({ ok: false, errors: [{ message: "Bucket 'ZZ' no longer exists" }] });
    expect(planChanges(tab, 'delete', [{ bucket: 'ZZ' }], current, lk)).toMatchObject({ ok: false });
  });
  it('plans deletes with the ETag', () => {
    const plan = planChanges(tab, 'delete', [{ bucket: 'B03' }], current, lk);
    expect(plan).toMatchObject({ ok: true, ops: [{ op: 'delete', id: 'B03', key: { bucket: 'B03' }, etag: 'W/"B03"' }], result: { deleted: 1 } });
  });
  it('refuses empty, malformed and oversized requests', () => {
    expect(planChanges(tab, 'create', [], current, lk).ok).toBe(false);
    expect(planChanges(tab, 'create', 'rows', current, lk).ok).toBe(false);
    expect(planChanges(tab, 'create', Array.from({ length: MAX_ROWS + 1 }, () => fresh), current, lk).ok).toBe(false);
  });
});

describe('applyLocal', () => {
  const at = new Date(2026, 9, 10, 14, 5, 9);
  it('stamps creates and updates and removes deletes', () => {
    const plan = planChanges(tab, 'create', [fresh], current, lk);
    if (!plan.ok) throw new Error('plan failed');
    const created = applyLocal(tab, timeBuckets.stamps, current, plan.ops, 'demo', at);
    expect(created.at(-1)).toMatchObject({ bucket: 'B09', enteredBy: 'DEMO', enteredOn: '20261010', entryTime: '140509', changedBy: '' });
    const updated = applyLocal(tab, timeBuckets.stamps, created, [{ op: 'update', id: 'B09', key: { bucket: 'B09' }, data: { description: 'X' } }], 'demo', at);
    expect(updated.at(-1)).toMatchObject({ description: 'X', enteredBy: 'DEMO', changedBy: 'DEMO', changedOn: '20261010' });
    expect(applyLocal(tab, timeBuckets.stamps, updated, [{ op: 'delete', id: 'B09', key: { bucket: 'B09' } }], 'demo', at)).toHaveLength(3);
  });
});
