// A report's breakdown opens as a pop-up (default) or as a page in place of the report, by the module's breakdownOpens.
import { act, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavProvider } from '@/lib/client/nav';
import ReportWorkbench from '@/components/report/ReportWorkbench';
import type { AnyReportDef } from '@/modules/types';
import { miniDom, type FakeElement, type MiniDom } from '../support/mini-dom';

vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  moduleView: async () => ({ mode: 'local', lookups: {} }),
  reportRun: async () => ({ rows: [{ id: 'A', name: 'Outflows', b1: '1234567.50' }], meta: { selection: {}, selectionText: 'All', readAt: '' } }),
  reportBreakdown: async () => ({ rows: [{ id: 'A:01', name: 'Loans', b1: '1000.00' }], row: { id: 'A', name: 'Outflows', b1: '1000.00' } })
}));
vi.mock('@/components/table/DataTable', async original => ({
  ...(await original<typeof import('@/components/table/DataTable')>()),
  DataTable: ({ className, children }: { className?: string; children: ReactNode }) => <table className={className}>{children}</table>
}));
vi.mock('@/components/shell/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { session: { actingUser: 'ME' } } }) }));

const def = (breakdownOpens: 'popup' | 'page'): AnyReportDef => ({
  kind: 'report', id: 'test-report', title: 'Test report', serviceKey: 'test', storageKey: 'test-report', selection: [], lookups: () => ({}),
  breakdownOpens, drill: () => ({ kind: 'breakdown' }),
  report: {
    variant: 'formatted', entity: 's', idField: 'id', idLabel: 'Group ID', parent: { by: 'prefix', separator: ':' }, style: () => 'normal',
    columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1-7 days', type: 'amount', drillable: true }]
  }
} as unknown as AnyReportDef);

let dom: MiniDom | null = null;
afterEach(() => { dom?.unmount(); dom = null; vi.unstubAllGlobals(); });
const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const click = async (el: FakeElement | undefined) => { act(() => dom!.click(el!)); await flush(); };
async function open(d: AnyReportDef) {
  dom = miniDom('/report?s=');
  dom.render(<NavProvider><ReportWorkbench def={d} /></NavProvider>);
  await flush();
}
const label = (t: string) => dom!.findAll('button').find(b => b.textContent.includes(t));

describe('a report whose breakdown opens as a page', () => {
  it('replaces the report with the breakdown, no dialog; Back to report returns and clears ?drill=', async () => {
    await open(def('page'));
    expect(dom!.findAll('table.qr-table')).toHaveLength(1);
    await click(dom!.find('td.qr-drillable'));
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(0);
    expect(dom!.findAll('table.qr-table')).toHaveLength(0);
    expect(dom!.find('section.kit-record-page').textContent).toContain('Loans');
    expect(window.location.search).toContain('drill=');
    await click(label('Back to report'));
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(0);
    expect(dom!.findAll('table.qr-table')).toHaveLength(1);
    expect(window.location.search).not.toContain('drill=');
  });
  it('moves focus to the breakdown heading', async () => {
    await open(def('page'));
    await click(dom!.find('td.qr-drillable'));
    expect(dom!.document.activeElement?.tagName).toBe('h2');
  });
});

describe('a report whose breakdown opens as a pop-up', () => {
  it('keeps the report and opens the dialog', async () => {
    await open(def('popup'));
    await click(dom!.find('td.qr-drillable'));
    expect(dom!.findAll('div[role=dialog]')).toHaveLength(1);
    expect(dom!.findAll('table.qr-table')).toHaveLength(1);
    expect(dom!.findAll('section.kit-record-page')).toHaveLength(0);
  });
});
