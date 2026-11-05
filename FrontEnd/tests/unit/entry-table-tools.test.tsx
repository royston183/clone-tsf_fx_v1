// The Overview summary tables and the Add / Edit entry grids render without the layout and export controls.
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Workbench from '@/components/workbench/Workbench';
import { SummaryTable } from '@/components/dashboard/SummaryTable';
import type { TableData } from '@/lib/dashboard/types';
import { DEFAULT_UNITS } from '@/lib/report/types';
import type { AnyModule } from '@/modules/registry';
import { miniDom, type FakeElement, type MiniDom } from '../support/mini-dom';

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  moduleView: async () => ({ mode: 'local', service: null, tables: { t: [{ id: '1' }] }, lookups: {} })
}));
vi.mock('@/components/shell/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { session: { actingUser: 'u' } } }) }));
vi.mock('@/components/fields/FieldControl', () => ({ FieldControl: ({ def }: { def: { field: string } }) => <span>{def.field}</span> }));
// The table sizes its columns from real layout, which the fake DOM has none of: record the props instead.
vi.mock('@/components/table/DataTable', () => ({
  columnsFor: () => [],
  DataTable: (props: Record<string, unknown>) => { seen.props.push(props); return <table>{props.children as React.ReactNode}</table>; }
}));
vi.mock('@/components/list/LargeList', () => ({
  LargeList: ({ selection }: { selection: { onChange: (rows: Record<string, string>[]) => void } }) =>
    <ul><li><button className="mock-pick" onClick={() => selection.onChange([{ id: '1' }])}>Pick</button></li></ul>
}));

const def = {
  id: 'test-prices', title: 'Prices', noun: 'prices', storageKey: 'test-prices', blankRows: 1, opens: { create: 'popup', open: 'popup' }, lookups: () => ({}),
  tabs: [{
    id: 't', label: 'Prices', title: 'Prices', noun: ['Price', 'Prices'], editable: true, keys: ['id'], defaultSort: { col: 'id', dir: 1 },
    columns: [{ field: 'id', label: 'ID', text: (r: Record<string, string>) => r.id ?? '' }], search: () => [], filters: [],
    grid: [{ field: 'id', label: 'ID', type: 'code', key: true }], check: () => ({}),
    large: true, list: { entity: 't', keys: ['id'], columns: [], fields: [], defaultSort: { field: 'id', dir: 1 } }
  }]
} as unknown as AnyModule;

let dom: MiniDom | null = null;
afterEach(() => { dom?.unmount(); dom = null; seen.props.length = 0; });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const button = (label: string) => dom!.findAll('button').find(b => b.textContent.startsWith(label));
const click = async (el: FakeElement | undefined) => { act(() => dom!.click(el!)); await flush(); };
const editGrid = () => seen.props.filter(p => String(p.className).includes('ds-grid'));

describe('table tools in entry grids and the Overview', () => {
  it('the Overview summary table shows no layout or export controls', () => {
    const data: TableData = { columns: [{ id: 'b1', label: '1-7 days' }], rows: [{ label: 'A', cells: { b1: '10' } }] };
    const html = renderToStaticMarkup(<SummaryTable data={data} unit={DEFAULT_UNITS[0]} onOpen={() => {}} />);
    expect(html).toContain('<table');
    expect(seen.props.length).toBeGreaterThan(0);
    for (const p of seen.props) expect(p).toMatchObject({ nativeLayout: true, nativeExport: true });
  });
  it('the Add entries grid is a native table without layout or export controls', async () => {
    dom = miniDom('/prices');
    dom.render(<Workbench def={def} />);
    await flush();
    await click(button('Add'));
    expect(editGrid().length).toBeGreaterThan(0);
    for (const p of editGrid()) expect(p).toMatchObject({ nativeLayout: true, nativeExport: true });
  });
  it('the Edit entries grid is a native table without layout or export controls', async () => {
    dom = miniDom('/prices');
    dom.render(<Workbench def={def} />);
    await flush();
    await click(dom.find('button.mock-pick'));
    await click(button('Edit'));
    expect(editGrid().length).toBeGreaterThan(0);
    for (const p of editGrid()) expect(p).toMatchObject({ nativeLayout: true, nativeExport: true });
  });
});
