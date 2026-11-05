// The object page in a fake DOM: a record opens as a page or a wizard in place of the list, Back returns, the wizard
// moves with Next / Back and shows Save only on its last step, wizardSkip leaves a step out, an unsaved page asks before
// Back, and Ctrl+S ignores the question on top. (Markup-level checks are in object-frames.test.tsx.)
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavProvider } from '@/lib/client/nav';
import { ObjectEditor } from '@/components/object/ObjectEditor';
import ObjectWorkbench from '@/components/object/ObjectWorkbench';
import type { AnyObjectDef, OpenMode } from '@/modules/types';
import { miniDom, type FakeElement, type MiniDom } from '../support/mini-dom';

const saved = vi.hoisted(() => ({ writes: [] as unknown[] }));
vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  moduleView: async () => ({ mode: 'local', lookups: {} }),
  objectRead: async () => ({ header: { id: '1', type: 'x' }, items: {} }),
  objectWrite: async (_id: string, what: string, body: unknown) => { saved.writes.push([what, body]); return { header: { id: '1', type: 'x' }, items: {} }; }
}));
vi.mock('@/components/list/LargeList', () => ({
  LargeList: ({ onOpen }: { onOpen: (row: Record<string, string>) => void }) => <ul className="mock-list"><li><button className="mock-row" onClick={() => onOpen({ id: '1' })}>Row 1</button></li></ul>
}));
vi.mock('@/components/fields/FieldControl', () => ({ FieldControl: ({ def }: { def: { field: string } }) => <span className="mock-field">{def.field}</span> }));

const Change = ({ onHeader }: { onHeader: (f: string, v: string) => void }) => <button className="mock-change" onClick={() => onHeader('type', 'y')}>Change</button>;
const Plain = () => <p>Body</p>;
const custom = (id: string) => ({ kind: 'custom' as const, id, label: id.toUpperCase(), component: id === 'a' ? Change : Plain });
const def = (opens: { create: OpenMode; open: OpenMode }, wizardSkip?: (stepId: string, header: Record<string, string>) => boolean): AnyObjectDef => ({
  kind: 'object', id: 'test-loans', title: 'Loans', serviceKey: 'test', storageKey: 'test-loans', noun: ['Loan', 'Loans'], opens, wizardSkip,
  list: { entity: 'loans', keys: ['id'], columns: [{ field: 'id', label: 'ID', text: (r: Record<string, string>) => r.id ?? '' }], fields: [{ field: 'id', label: 'ID', type: 'code' }], defaultSort: { field: 'id', dir: 1 } },
  header: [{ field: 'id', label: 'ID', type: 'code', key: true }, { field: 'type', label: 'Type', type: 'text' }],
  tabs: [custom('a'), custom('b'), custom('c')], defaults: () => ({ type: 'x' }), lookups: () => ({})
} as unknown as AnyObjectDef);

let dom: MiniDom | null = null;
afterEach(() => { dom?.unmount(); dom = null; vi.unstubAllGlobals(); saved.writes.length = 0; });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = (el: FakeElement) => el.textContent;
const buttons = (label: string) => dom!.findAll('button').filter(b => text(b) === label);
const button = (label: string) => buttons(label)[0];
const steps = () => dom!.findAll('b').map(b => text(b));
const current = () => text(dom!.find('li.current'));
const dialogs = () => dom!.findAll('div[role=dialog]').map(text).join('|');
const hidden = (el: FakeElement) => { for (let n: { parentNode: unknown; hasAttribute?: (a: string) => boolean } | null = el; n; n = n.parentNode as typeof n) if (n.hasAttribute?.('hidden')) return true; return false; };

async function workbench(d: AnyObjectDef) {
  dom = miniDom('/loans');
  dom.render(<NavProvider><ObjectWorkbench def={d} /></NavProvider>);
  await flush();
}
async function editor(d: AnyObjectDef, key: Record<string, string> | null) {
  dom = miniDom('/loans');
  dom.render(<ObjectEditor def={d} lk={{}} objectKey={key} frame={key ? d.opens.open : d.opens.create} onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} onAction={() => {}} />);
  await flush();
}
const click = async (el: FakeElement | undefined) => { act(() => dom!.click(el!)); await flush(); };
const back = async () => { act(() => dom!.history.back()); await flush(); };

describe('a record that opens as a page', () => {
  it('hides the list and shows the page, no dialog; Back shows the list again', async () => {
    await workbench(def({ create: 'popup', open: 'page' }));
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
    await click(dom!.find('button.mock-row'));
    expect(hidden(dom!.find('ul.mock-list'))).toBe(true);
    expect(text(dom!.find('section.kit-record-page'))).toContain('Loan');
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(0);
    await back();
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(0);
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
  });
  it('keeps the list and opens a dialog for a pop-up', async () => {
    await workbench(def({ create: 'popup', open: 'popup' }));
    await click(dom!.find('button.mock-row'));
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(1);
  });
  it('moves focus to the page heading', async () => {
    await workbench(def({ create: 'popup', open: 'page' }));
    await click(dom!.find('button.mock-row'));
    expect(dom!.document.activeElement?.tagName).toBe('h2');
  });
  it('with unsaved changes, Back asks "Discard changes?" and stays until it is confirmed', async () => {
    await workbench(def({ create: 'popup', open: 'page' }));
    await click(dom!.find('button.mock-row'));
    await click(button('Edit'));
    await click(dom!.find('button.mock-change'));
    await back();
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(1);
    expect(dialogs()).toContain('Discard changes?');
    await click(button('Yes, Discard'));
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(0);
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
  });
});

describe('a record that opens as a wizard', () => {
  it('starts on Details; Next and Back move one step; Save shows only on the last step', async () => {
    await editor(def({ create: 'wizard', open: 'popup' }), null);
    expect(steps()).toEqual(['Details', 'A', 'B', 'C']);
    expect(current()).toContain('Details');
    expect(button('Next')).toBeDefined();
    expect(button('Back')).toBeUndefined();
    expect(button('Create Loan')).toBeUndefined();
    await click(button('Next'));
    expect(current()).toContain('A');
    expect(button('Back')).toBeDefined();
    await click(button('Next'));
    await click(button('Next'));
    expect(current()).toContain('C');
    expect(button('Next')).toBeUndefined();
    expect(button('Create Loan')).toBeDefined();
    await click(button('Back'));
    expect(current()).toContain('B');
    expect(button('Create Loan')).toBeUndefined();
  });
  it('leaves out the step wizardSkip skips', async () => {
    await editor(def({ create: 'wizard', open: 'popup' }, (id, header) => id === 'b' && header.type === 'x'), null);
    expect(steps()).toEqual(['Details', 'A', 'C']);
  });
  it('shows a record for reading as a page, and Edit starts the wizard on Details', async () => {
    await editor(def({ create: 'popup', open: 'wizard' }), { id: '1' });
    expect(dom!.findAll('ol.kit-wizard')).toHaveLength(0);
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(1);
    await click(dom!.findAll('button').find(b => text(b) === 'A'));
    await click(button('Edit'));
    expect(steps()).toEqual(['Details', 'A', 'B', 'C']);
    expect(current()).toContain('Details');
    expect(button('Save')).toBeUndefined();
    expect(button('Next')).toBeDefined();
  });
  it('Ctrl+S saves only from the last step', async () => {
    await editor(def({ create: 'wizard', open: 'popup' }), null);
    act(() => dom!.press('s', { ctrl: true }));
    await flush();
    expect(saved.writes).toHaveLength(0);
    for (let i = 0; i < 3; i++) await click(button('Next'));
    act(() => dom!.press('s', { ctrl: true }));
    await flush();
    expect(saved.writes).toHaveLength(1);
  });
});

describe('Ctrl+S in a page record', () => {
  it('does not save behind "Discard changes?", and saves once it is closed', async () => {
    await editor(def({ create: 'page', open: 'popup' }), null);
    await click(dom!.find('button.mock-change'));
    await click(button('Cancel'));
    expect(dialogs()).toContain('Discard changes?');
    act(() => dom!.press('s', { ctrl: true }));
    await flush();
    expect(saved.writes).toHaveLength(0);
    await click(buttons('Cancel').at(-1));
    expect(dialogs()).toBe('');
    act(() => dom!.press('s', { ctrl: true }));
    await flush();
    expect(saved.writes).toHaveLength(1);
  });
});

describe('the object list wrapper', () => {
  // The list (with its notices) sits in a wrapper hidden while a page shows; the wrapper carries the notice margins the
  // notices had as direct children of .ds-app (kit.css .kit-app-list>.notice, skin.css .kit-app-list > .notice).
  it('the sample-data notice is a direct child of div.kit-app-list inside section.ds-app', async () => {
    await workbench(def({ create: 'popup', open: 'page' }));
    const wrapper = dom!.find('div.notice').parentNode as FakeElement;
    expect(wrapper.classList.contains('kit-app-list')).toBe(true);
    expect((wrapper.parentNode as FakeElement).classList.contains('ds-app')).toBe(true);
  });
});
