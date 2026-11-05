// A table's rows open as a page, a pop-up or a wizard (module.opens): Add uses opens.create, Edit uses opens.open.
// A page takes the table's place (no dialog) and Cancel brings the table back; a pop-up has no step strip, a wizard has.
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Workbench from '@/components/workbench/Workbench';
import type { AnyModule } from '@/modules/registry';
import type { OpenMode } from '@/modules/types';
import { miniDom, type FakeElement, type MiniDom } from '../support/mini-dom';

const changes = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  moduleView: async () => ({ mode: 'local', service: null, tables: { t: [{ id: '1' }] }, lookups: {} }),
  moduleChange: async (...args: unknown[]) => { changes.calls.push(args); return { mode: 'local', service: null, tables: { t: [{ id: '1' }] }, lookups: {}, result: { created: 1, updated: 1, deleted: 0, skipped: 0 } }; }
}));
vi.mock('@/components/shell/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { session: { actingUser: 'u' } } }) }));
vi.mock('@/components/fields/FieldControl', () => ({
  FieldControl: ({ def, onChange }: { def: { field: string }; onChange?: (field: string, value: string) => void }) =>
    <span className="mock-field">{def.field}<button className="mock-type" onClick={() => onChange?.(def.field, 'NEW')}>Type</button></span>
}));
// The table sizes its columns from real layout, which the fake DOM has none of.
vi.mock('@/components/table/DataTable', () => ({ columnsFor: () => [], DataTable: ({ children }: { children: React.ReactNode }) => <table>{children}</table> }));
vi.mock('@/components/list/LargeList', () => ({
  LargeList: ({ selection }: { selection: { onChange: (rows: Record<string, string>[]) => void } }) =>
    <ul className="mock-list"><li><button className="mock-pick" onClick={() => selection.onChange([{ id: '1' }])}>Pick</button></li></ul>
}));

const def = (opens: { create: OpenMode; open: OpenMode }, large = true) => ({
  id: 'test-loans', title: 'Loans', noun: 'loans', storageKey: 'test-loans', blankRows: 1, opens, lookups: () => ({}),
  tabs: [{
    id: 't', label: 'Loans', title: 'Loans', noun: ['Loan', 'Loans'], editable: true, keys: ['id'], defaultSort: { col: 'id', dir: 1 },
    columns: [{ field: 'id', label: 'ID', text: (r: Record<string, string>) => r.id ?? '' }], search: () => [], filters: [],
    grid: [{ field: 'id', label: 'ID', type: 'code', key: true }], check: () => ({}),
    large, list: { entity: 't', keys: ['id'], columns: [], fields: [], defaultSort: { field: 'id', dir: 1 } }
  }]
} as unknown as AnyModule);

let dom: MiniDom | null = null;
afterEach(() => { dom?.unmount(); dom = null; vi.unstubAllGlobals(); changes.calls.length = 0; });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const text = (el: FakeElement) => el.textContent;
const button = (label: string) => dom!.findAll('button').find(b => text(b).startsWith(label));
const click = async (el: FakeElement | undefined) => { act(() => dom!.click(el!)); await flush(); };
const hidden = (el: FakeElement) => { for (let n: { parentNode: unknown; hasAttribute?: (a: string) => boolean } | null = el; n; n = n.parentNode as typeof n) if (n.hasAttribute?.('hidden')) return true; return false; };

async function open(opens: { create: OpenMode; open: OpenMode }, large = true) {
  dom = miniDom('/loans');
  dom.render(<Workbench def={def(opens, large)} />);
  await flush();
}
const edit = async () => { await click(dom!.find('button.mock-pick')); await click(button('Edit')); };

describe('table rows by opening mode', () => {
  it('opens.open = page: Edit shows the page in place of the table, no dialog; Cancel brings the table back', async () => {
    await open({ create: 'popup', open: 'page' });
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
    await edit();
    expect(hidden(dom!.find('ul.mock-list'))).toBe(true);
    expect(dom!.findAll('div.kit-grid-page')).toHaveLength(1);
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(0);
    await click(button('Cancel'));
    expect(dom!.findAll('div.kit-grid-page')).toHaveLength(0);
    expect(hidden(dom!.find('ul.mock-list'))).toBe(false);
  });
  it('opens.create = popup: Add shows a dialog without the step strip', async () => {
    await open({ create: 'popup', open: 'page' });
    await click(button('Add'));
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(1);
    expect(dom!.findAll('ol.kit-wizard')).toHaveLength(0);
    expect(dom!.findAll('div.kit-grid-page')).toHaveLength(0);
  });
  it('opens.open = wizard: Edit shows a dialog with the step strip', async () => {
    await open({ create: 'popup', open: 'wizard' });
    await edit();
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(1);
    expect(dom!.findAll('ol.kit-wizard')).toHaveLength(1);
  });
  it('opens.create = page: Add shows the page, no dialog', async () => {
    await open({ create: 'page', open: 'popup' });
    await click(button('Add'));
    expect(dom!.findAll('div.kit-grid-page')).toHaveLength(1);
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(0);
  });
});

describe('adding rows in a wizard', () => {
  const hint = () => dom!.find('span.ds-foot-hint').textContent;
  it('opens.create = wizard: Add goes to Review before anything is saved, then saves', async () => {
    await open({ create: 'wizard', open: 'popup' });
    await click(button('Add'));
    expect(hint()).toContain('Ctrl+S reviews');
    await click(dom!.find('button.mock-type'));
    await click(button('Add 1 Entry'));
    expect(changes.calls).toHaveLength(0);
    expect(dom!.find('li.current').textContent).toContain('Review changes');
    expect(dom!.findAll('div[role=dialog]').map(d => d.textContent).join('')).toContain('Review entries');
    await click(button('Yes, Add 1 Entry'));
    expect(changes.calls).toHaveLength(1);
    expect((changes.calls[0] as unknown[])[2]).toBe('create');
  });
  it('opens.create = popup: Add saves at once, with no Review step', async () => {
    await open({ create: 'popup', open: 'popup' });
    await click(button('Add'));
    expect(hint()).toContain('Ctrl+S saves');
    await click(dom!.find('button.mock-type'));
    await click(button('Add 1 Entry'));
    expect(changes.calls).toHaveLength(1);
  });
});

describe('the table list wrapper', () => {
  // Notices and the filter bar sit in the list wrapper (hidden while a page shows), which carries the margins they had
  // as direct children of .ds-app (kit.css .kit-app-list>.notice, skin.css .kit-app-list > .notice / .ds-filters).
  it('the sample-data notice is a direct child of div.kit-app-list inside section.ds-app', async () => {
    await open({ create: 'popup', open: 'page' });
    const notice = dom!.find('div.notice');
    const wrapper = notice.parentNode as FakeElement;
    expect(wrapper.classList.contains('kit-app-list')).toBe(true);
    expect((wrapper.parentNode as FakeElement).classList.contains('ds-app')).toBe(true);
  });
  it('the filter bar of a small table is a direct child of div.kit-app-list', async () => {
    await open({ create: 'popup', open: 'page' }, false);
    expect((dom!.find('div.ds-filters').parentNode as FakeElement).classList.contains('kit-app-list')).toBe(true);
  });
});
