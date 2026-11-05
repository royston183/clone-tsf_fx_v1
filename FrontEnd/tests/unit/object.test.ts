// tests/unit/object.test.ts
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import {
  checkObject, detailsToProblems, diffObject, hasProblems, headerFields, isUnchanged, itemsSummary, itemsTabs, keyFromParam,
  nextItemValues, openParam, problemsToDetails, savedObject, type ObjectData
} from '@/lib/object/object';
import type { AnyObjectDef } from '@/modules/types';

const def: AnyObjectDef = {
  kind: 'object', id: 'deals', title: 'Deals', noun: ['Deal', 'Deals'], serviceKey: 's', storageKey: 'k', keyBySap: true, lookups: () => ({}),
  opens: { create: 'popup', open: 'popup' },
  list: { entity: 'deals', keys: ['deal'], columns: [], fields: [], defaultSort: { field: 'deal', dir: 1 } },
  header: [
    { field: 'deal', label: 'Deal *', type: 'code', key: true, required: true },
    { field: 'name', label: 'Deal Name *', type: 'text', max: 20, required: true },
    { field: 'amount', label: 'Amount *', type: 'amount', required: true }
  ],
  tabs: [
    { kind: 'fields', id: 'basic', label: 'Basic Data', groups: [{ title: 'Terms', fields: [{ field: 'start', label: 'Validity', type: 'dateRange', toField: 'end' }, { field: 'name', label: 'Again' }] }] },
    { kind: 'items', id: 'flows', label: 'Cash Flows', table: 'flows', keys: ['deal', 'seq'], columns: [], grid: [
      { field: 'seq', label: 'No. *', type: 'integer', max: 3, key: true, required: true },
      { field: 'payDate', label: 'Payment Date *', type: 'date', required: true },
      { field: 'amount', label: 'Amount *', type: 'amount', required: true }
    ] }
  ],
  check: (header: Row, items: Record<string, Row[]>) => ({
    header: (header.name === 'Blocked' ? { name: 'This name is blocked.' } : {}) as Record<string, string>,
    items: { flows: (items.flows ?? []).flatMap((r, i) => (r.payDate && header.start && r.payDate < header.start ? [{ row: i + 1, field: 'payDate', message: 'Payment Date must not be before the deal starts.' }] : [])) },
    messages: (items.flows ?? []).length ? [] : ['Add at least one cash flow.']
  })
};
const flow = (seq: string, extra: Row = {}): Row => ({ seq, payDate: '2026-10-01', amount: '100.00', ...extra });

describe('object keys in URLs', () => {
  it('uses the value for one key field and a JSON array for several', () => {
    expect(openParam(['deal'], { deal: "O'1~2" })).toBe("O'1~2");
    expect(keyFromParam(['deal'], "O'1~2")).toEqual({ deal: "O'1~2" });
    expect(openParam(['deal', 'seq'], { deal: 'D1', seq: '2' })).toBe('["D1","2"]');
    expect(keyFromParam(['deal', 'seq'], '["D1","2"]')).toEqual({ deal: 'D1', seq: '2' });
    expect(keyFromParam(['deal', 'seq'], 'not json')).toBeNull();
    expect(keyFromParam(['deal', 'seq'], '["D1"]')).toBeNull();
    expect(keyFromParam(['deal'], null)).toBeNull();
  });
});

describe('headerFields', () => {
  it('takes the head block, then the field groups, each field once', () => {
    expect(headerFields(def).map(d => d.field)).toEqual(['deal', 'name', 'amount', 'start']);
    expect(itemsTabs(def).map(t => t.id)).toEqual(['flows']);
  });
});

describe('checkObject', () => {
  it('checks header and items by type and skips the key SAP assigns', () => {
    const p = checkObject(def, { header: { deal: '', name: '', amount: 'abc', start: '2026-04-01', end: '2026-03-01' }, items: { flows: [flow('1'), flow('2', { amount: '' })] } }, {}, 'create');
    expect(p.header).toEqual({
      name: 'Deal Name is required',
      amount: 'Amount must be an amount with at most 2 decimals, e.g. 1234.50.',
      end: 'Validity: the end date must not be before the start date.'
    });
    expect(p.items.flows).toEqual([{ row: 2, field: 'amount', message: 'Amount is required' }]);
    expect(hasProblems(p)).toBe(true);
  });
  it('requires the key when editing, finds duplicate item keys and adds the module rules', () => {
    const p = checkObject(def, { header: { deal: '', name: 'Blocked', amount: '1.00', start: '2026-12-01', end: '' }, items: { flows: [flow('1'), flow('1')] } }, {}, 'edit');
    expect(p.header).toEqual({ deal: 'Deal is required', name: 'This name is blocked.' });
    expect(p.items.flows).toEqual([
      { row: 2, field: 'seq', message: "No. '1' is used twice." },
      { row: 1, field: 'payDate', message: 'Payment Date must not be before the deal starts.' },
      { row: 2, field: 'payDate', message: 'Payment Date must not be before the deal starts.' }
    ]);
    const empty = checkObject(def, { header: { deal: 'D1', name: 'Fine', amount: '1.00', start: '', end: '' }, items: { flows: [] } }, {}, 'edit');
    expect(empty.messages).toEqual(['Add at least one cash flow.']);
    expect(hasProblems(empty)).toBe(true);
  });
});

describe('diffObject', () => {
  const before: ObjectData = {
    header: { deal: 'D1', name: 'Old', amount: '1000.00', start: '2026-04-01', end: '2027-03-31', __etag: 'W/"1"' },
    items: { flows: [
      { deal: 'D1', seq: '1', payDate: '2026-10-01', amount: '100.00', __etag: 'W/"f1"' },
      { deal: 'D1', seq: '2', payDate: '2027-04-01', amount: '200.00', __etag: 'W/"f2"' },
      { deal: 'D1', seq: '3', payDate: '2027-10-01', amount: '300.00', __etag: 'W/"f3"' }
    ] }
  };
  it('plans the changed header fields and the items by key', () => {
    const after: ObjectData = {
      header: { deal: 'D1', name: 'New', amount: '1000', start: '2026-04-01', end: '2027-03-31' },
      items: { flows: [flow('1', { amount: '150' }), { seq: '3', payDate: '2027-10-01', amount: '300.00' }, { seq: '4', payDate: '2028-04-01', amount: '50' }] }
    };
    const d = diffObject(def, before, after);
    expect(d.header).toEqual({ name: 'New' });
    expect(d.items).toEqual([
      { tab: 'flows', op: 'update', key: { seq: '1' }, data: { amount: '150.00' }, etag: 'W/"f1"' },
      { tab: 'flows', op: 'create', key: { seq: '4' }, data: { seq: '4', payDate: '2028-04-01', amount: '50.00' } },
      { tab: 'flows', op: 'delete', key: { seq: '2' }, data: {}, etag: 'W/"f2"' }
    ]);
    expect(d.counts.flows).toEqual({ created: 1, updated: 1, deleted: 1 });
    expect(itemsSummary(def, d)).toEqual(['Cash Flows: 1 added, 1 changed, 1 deleted']);
    expect(isUnchanged(d)).toBe(false);
  });
  it('sees nothing to save when only the notation differs', () => {
    const same: ObjectData = {
      header: { deal: 'D1', name: 'Old', amount: '1,000', start: '01-04-2026', end: '2027-03-31' },
      items: { flows: before.items.flows.map(r => ({ seq: r.seq, payDate: r.payDate, amount: r.amount.replace('.00', '') })) }
    };
    const d = diffObject(def, before, same);
    expect(isUnchanged(d)).toBe(true);
    expect(itemsSummary(def, d)).toEqual([]);
  });
});

describe('new item rows and problem transport', () => {
  it('numbers a new item one above the highest, plus the rows already being added', () => {
    expect(nextItemValues(def, itemsTabs(def)[0], [{ seq: '1' }, { seq: '7' }, { seq: '' }], 2)).toEqual({ seq: '10' });
    expect(nextItemValues(def, itemsTabs(def)[0], [], 0)).toEqual({ seq: '1' });
  });
  it('sends problems as error details and reads them back', () => {
    const p = { header: { name: 'Deal Name is required' }, items: { flows: [{ row: 2, field: 'seq', message: "No. '1' is used twice." }] }, messages: ['Add at least one cash flow.'] };
    const details = problemsToDetails(p);
    expect(details).toEqual([{ field: 'name', message: 'Deal Name is required' }, { tab: 'flows', row: 2, field: 'seq', message: "No. '1' is used twice." }, { message: 'Add at least one cash flow.' }]);
    expect(detailsToProblems(details)).toEqual(p);
  });
});

describe('savedObject (what the server saves)', () => {
  const stored: ObjectData = { header: { deal: 'D1', name: 'Deal', amount: '5.00' }, items: { flows: [{ deal: 'D1', ...flow('1'), __etag: 'W/"1"' }, { deal: 'D1', ...flow('2'), __etag: 'W/"2"' }] } };
  it('keeps the stored items of a tab the browser did not send, so nothing is deleted', () => {
    const after = savedObject(def, stored, { header: { ...stored.header, name: 'Renamed' } });
    expect(after.items.flows.map(r => r.seq)).toEqual(['1', '2']);
    const diff = diffObject(def, stored, after);
    expect(diff.items).toEqual([]);
    expect(diff.header).toEqual({ name: 'Renamed' });
  });
  it('keeps the stored items of a tab that is not editable, whatever the browser sent', () => {
    const locked: AnyObjectDef = { ...def, tabs: def.tabs.map(t => (t.kind === 'items' ? { ...t, editable: false } : t)) };
    const after = savedObject(locked, stored, { header: stored.header, items: { flows: [flow('1', { amount: '999.00' })] } });
    expect(diffObject(locked, stored, after).items).toEqual([]);
  });
  it('takes the sent items of an editable tab', () => {
    const after = savedObject(def, stored, { header: stored.header, items: { flows: [flow('1', { amount: '999.00' })] } });
    expect(diffObject(def, stored, after).counts.flows).toEqual({ created: 0, updated: 1, deleted: 1 });
  });
});
