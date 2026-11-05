// Record actions that ask for input, per-record edit / delete locks and display-only `shown` values, in a fake DOM: an
// action with inputs opens a form (checked like any form, nothing sent while a field is wrong) and sends its values; an
// action without inputs keeps its "Yes, …" question; editableWhen / deletableWhen hide Edit / Delete; `shown` is the
// text outside editing while the edit form keeps the stored value.
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectEditor, objectFooter } from '@/components/object/ObjectEditor';
import type { Row } from '@/lib/grid/types';
import type { AnyObjectDef } from '@/modules/types';
import { miniDom, type FakeElement, type MiniDom } from '../support/mini-dom';

const calls = vi.hoisted(() => ({ actions: [] as unknown[], writes: [] as unknown[] }));
vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  objectRead: async () => ({ header: { id: '1', status: 'A', note: 'n1', __etag: 'W/"1"' }, items: {} }),
  objectAction: async (...args: unknown[]) => { calls.actions.push(args); return { header: { id: '1', status: 'S', note: 'n1', __etag: 'W/"2"' }, items: {} }; },
  objectWrite: async (...args: unknown[]) => { calls.writes.push(args); return { header: { id: '2', status: 'D', note: '', __etag: 'W/"1"' }, items: {} }; }
}));
// A form control that shows its field, value and error, and fills itself on a click.
// Read-only shows as [read-only], a hint in brackets.
vi.mock('@/components/fields/FieldControl', () => ({
  FieldControl: ({ def, row, error, readOnly, hint, onChange }: { def: { field: string }; row: Row; error?: string; readOnly?: boolean; hint?: string; onChange: (f: string, v: string) => void }) => (
    <span className="mock-field">{`${def.field}=${row[def.field] ?? ''}`}{readOnly && ' [read-only]'}{hint && ` (${hint})`}{error && <em className="mock-error">{error}</em>}
      <button className="mock-fill" onClick={() => onChange(def.field, 'Paid off')}>{`fill ${def.field}`}</button></span>
  )
}));

const STATUS: Record<string, string> = { A: 'Active', S: 'Settled' };
const def = (changes: Partial<AnyObjectDef> = {}): AnyObjectDef => ({
  kind: 'object', id: 'test-loans', title: 'Loans', serviceKey: 'test', storageKey: 'test-loans', noun: ['Loan', 'Loans'], opens: { create: 'popup', open: 'popup' },
  list: { entity: 'loans', keys: ['id'], columns: [], fields: [{ field: 'id', label: 'ID', type: 'code' }], defaultSort: { field: 'id', dir: 1 } },
  header: [{ field: 'id', label: 'ID', type: 'code', key: true }, { field: 'status', label: 'Status', type: 'text', shown: (r: Row) => `${STATUS[r.status] ?? r.status} (shown)` }],
  tabs: [{ kind: 'fields', id: 'main', label: 'Main', groups: [{ title: 'Notes', fields: [{ field: 'note', label: 'Note', type: 'text', shown: (r: Row) => `Note: ${r.note}` }] }] }],
  actions: [
    { id: 'settle', label: 'Settle', sapAction: 'Settle', confirm: 'Settle this loan with a reason.', inputs: [{ field: 'reason', label: 'Reason *', type: 'text', required: true }], apply: (_h: Row, v: Row) => ({ status: 'S', note: v.reason }) },
    { id: 'approve', label: 'Approve', sapAction: 'Approve', confirm: 'Approve this loan?', mock: (h: Row) => h }
  ],
  lookups: () => ({}),
  ...changes
} as unknown as AnyObjectDef);

let dom: MiniDom | null = null;
afterEach(() => { dom?.unmount(); dom = null; calls.actions.length = 0; calls.writes.length = 0; });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = (el: FakeElement) => el.textContent;
const buttons = (label: string) => dom!.findAll('button').filter(b => text(b) === label);
const dialogs = () => dom!.findAll('div[role=dialog]').map(text);
const click = async (el: FakeElement | undefined) => { act(() => dom!.click(el!)); await flush(); };
async function editor(d: AnyObjectDef, objectKey: Row | null = { id: '1' }) {
  dom = miniDom('/loans');
  dom.render(<ObjectEditor def={d} lk={{}} objectKey={objectKey} frame="popup" onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} onAction={() => {}} />);
  await flush();
}

describe('a record action that asks for input', () => {
  it('opens a form with the input fields and the action question, not a "Yes, …" question', async () => {
    await editor(def());
    await click(buttons('Settle')[0]);
    const form = dialogs().at(-1) ?? '';
    expect(form).toContain('Settle this loan with a reason.');
    expect(form).toContain('reason=');
    expect(buttons('Yes, Settle')).toHaveLength(0);
  });
  it('shows the field problem and sends nothing while a required input is empty', async () => {
    await editor(def());
    await click(buttons('Settle')[0]);
    await click(buttons('Settle').at(-1));
    expect(dom!.findAll('em.mock-error').map(text)).toEqual(['Reason is required.']);
    expect(calls.actions).toHaveLength(0);
  });
  it('sends the values with the key and ETag, then shows the record as the action left it', async () => {
    await editor(def());
    await click(buttons('Settle')[0]);
    await click(dom!.findAll('button.mock-fill').find(b => text(b) === 'fill reason'));
    await click(buttons('Settle').at(-1));
    expect(calls.actions).toEqual([['test-loans', 'settle', { key: { id: '1' }, etag: 'W/"1"', values: { reason: 'Paid off' } }]]);
    expect(dom!.findAll('div[role=dialog]').some(d => text(d).includes('Settle this loan'))).toBe(false);
    expect(text(dom!.find('div[role=dialog]'))).toContain('Settled (shown)');
  });
  it("shows the action's check message on its field and sends nothing while it fails", async () => {
    const settle = def().actions![0];
    await editor(def({ actions: [{ ...settle, check: (h: Row, v: Row) => (h.status === 'A' && v.reason === 'Paid off' ? { reason: 'Not while the loan is active.' } : {}) }] } as Partial<AnyObjectDef>));
    await click(buttons('Settle')[0]);
    await click(dom!.findAll('button.mock-fill').find(b => text(b) === 'fill reason'));
    expect(dom!.findAll('em.mock-error').map(text)).toEqual(['Not while the loan is active.']);
    await click(buttons('Settle').at(-1));
    expect(calls.actions).toHaveLength(0);
  });
  it('an action without inputs keeps its question and sends no values', async () => {
    await editor(def());
    await click(buttons('Approve')[0]);
    await click(buttons('Yes, Approve')[0]);
    expect(calls.actions).toEqual([['test-loans', 'approve', { key: { id: '1' }, etag: 'W/"1"' }]]);
  });
});

describe('shown values', () => {
  it('shows the `shown` text outside editing and the stored value in the edit form', async () => {
    await editor(def());
    const page = text(dom!.find('div[role=dialog]'));
    expect(page).toContain('Active (shown)');
    expect(page).toContain('Note: n1');
    await click(buttons('Edit')[0]);
    const form = dom!.findAll('span.mock-field').map(text).join('|');
    expect(form).toContain('status=A');
    expect(form).toContain('note=n1');
  });
  it('without `shown`, a field shows its formatted value as before', async () => {
    await editor(def({ header: [{ field: 'id', label: 'ID', type: 'code', key: true }, { field: 'status', label: 'Status', type: 'text' }] } as Partial<AnyObjectDef>));
    expect(text(dom!.find('div[role=dialog]'))).not.toContain('(shown)');
  });
});

describe('per-record edit and delete locks', () => {
  const on = { close: () => {}, edit: () => {}, delete: () => {}, action: () => {}, cancel: () => {}, save: () => {} };
  const footer = (d: AnyObjectDef, header: Row) => {
    const f = objectFooter({ def: d, header, mode: 'display', busy: false, on });
    return renderToStaticMarkup(<>{f.footerStart}{f.footer}</>);
  };
  const locked = def({ editableWhen: (h: Row) => h.status !== 'S', deletableWhen: (h: Row) => h.status === 'A' } as Partial<AnyObjectDef>);
  it('hides Edit while editableWhen is false and Delete while deletableWhen is false', () => {
    expect(footer(locked, { status: 'A' })).toMatch(/Delete[\s\S]*Edit/);
    const settled = footer(locked, { status: 'S' });
    expect(settled).not.toContain('Edit');
    expect(settled).not.toContain('Delete');
  });
  it('shows both for a definition without them, as before', () => {
    const html = footer(def(), { status: 'S' });
    expect(html).toContain('Edit');
    expect(html).toContain('Delete');
  });
});

describe('locked fields and server-set fields', () => {
  const fields = () => dom!.findAll('span.mock-field').map(text);
  it('lockedFields: read-only in the edit form with a hint, by the stored header', async () => {
    await editor(def({ lockedFields: (h: Row) => (h.status === 'A' ? ['note'] : []) } as Partial<AnyObjectDef>));
    await click(buttons('Edit')[0]);
    expect(fields().find(f => f.startsWith('note='))).toContain('[read-only] (Cannot change for this loan now)');
    expect(fields().find(f => f.startsWith('status='))).not.toContain('[read-only]');
  });
  it('without lockedFields every field stays editable, as before', async () => {
    await editor(def());
    await click(buttons('Edit')[0]);
    expect(fields().find(f => f.startsWith('note='))).not.toContain('[read-only]');
  });
  it('a field initial sets is read-only in the edit form (only actions change it)', async () => {
    await editor(def({ initial: () => ({ status: 'D' }) } as Partial<AnyObjectDef>));
    await click(buttons('Edit')[0]);
    expect(fields().find(f => f.startsWith('status='))).toContain('[read-only] (Cannot change for this loan now)');
    expect(fields().find(f => f.startsWith('note='))).not.toContain('[read-only]');
  });
  const required = { field: 'status', label: 'Status *', type: 'text', required: true };
  const withStatus = (changes: Partial<AnyObjectDef> = {}) => def({ header: [{ field: 'id', label: 'ID', type: 'code', key: true }, required], ...changes } as Partial<AnyObjectDef>);
  it('initial: the create form leaves out the fields the server sets, and a required one does not block Create', async () => {
    await editor(withStatus({ initial: () => ({ status: 'D' }) } as Partial<AnyObjectDef>), null);
    expect(fields().some(f => f.startsWith('status='))).toBe(false);
    expect(buttons('Create Loan')[0].hasAttribute('disabled')).toBe(false);
    await click(buttons('Create Loan')[0]);
    expect(calls.writes).toHaveLength(1);
  });
  it('without initial the required field shows on the create form and blocks Create', async () => {
    await editor(withStatus(), null);
    expect(fields().some(f => f.startsWith('status='))).toBe(true);
    expect(buttons('Create Loan')[0].hasAttribute('disabled')).toBe(true);
    expect(text(dom!.find('div[role=dialog]'))).toContain('1 field to fix');
    await click(buttons('Create Loan')[0]);
    expect(calls.writes).toHaveLength(0);
  });
});
