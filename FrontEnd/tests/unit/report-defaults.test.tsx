// A report's selection defaults and autoRun (as on dashboards): the form opens with the defaults under the last run's
// values (the URL's run still wins), runs at once when autoRun and the selection passes its checks, and "Use default
// selection" runs the defaults again. Without them a report waits for Run as before.
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavProvider } from '@/lib/client/nav';
import ReportWorkbench from '@/components/report/ReportWorkbench';
import type { AnyReportDef } from '@/modules/types';
import { miniDom, type MiniDom } from '../support/mini-dom';

const runs = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/client/data', async original => ({
  ...(await original<typeof import('@/lib/client/data')>()),
  moduleView: async () => ({ mode: 'local', lookups: {} }),
  reportRun: async (_id: string, body: { selection: Record<string, string> }) => {
    runs.push(body.selection);
    return { rows: [{ lease: 'L1', endDate: '2026-11-10' }], columns: [], meta: { selection: body.selection, selectionText: 'Leases', readAt: '', total: 1 } };
  }
}));
vi.mock('@/components/table/DataTable', async original => ({
  ...(await original<typeof import('@/components/table/DataTable')>()),
  DataTable: ({ className, children }: { className?: string; children: ReactNode }) => <table className={className}>{children}</table>
}));
vi.mock('@/components/shell/WorkspaceProvider', () => ({ useWorkspace: () => ({ workspace: { session: { actingUser: 'ME' } } }) }));

const DEFAULTS = { keyDate: '2026-10-31', days: '60', status: 'A' };
const report = (extra: Partial<AnyReportDef> = {}): AnyReportDef => ({
  kind: 'report', id: 'test-leases-ending', title: 'Leases Ending Soon', serviceKey: 'test', storageKey: 'test-leases-ending', breakdownOpens: 'popup',
  selection: [
    { field: 'keyDate', label: 'Key Date', type: 'date', required: true },
    { field: 'days', label: 'Days Ahead', type: 'integer', max: 4, required: true },
    { field: 'status', label: 'Status', type: 'text', max: 1 }
  ],
  report: {
    variant: 'lineItems', entity: 'leases', columns: [{ id: 'lease', label: 'Lease No.', type: 'code' }, { id: 'endDate', label: 'End Date', type: 'date' }],
    standard: { columns: ['lease', 'endDate'], sort: [], subtotals: [], unit: null, subtotalsOnly: false }
  },
  lookups: () => ({}),
  ...extra
} as AnyReportDef);

let dom: MiniDom | null = null;
let saved: Record<string, string> | null = null;
beforeEach(() => { runs.length = 0; saved = null; });
afterEach(() => { dom?.unmount(); dom = null; vi.unstubAllGlobals(); });
const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
async function open(def: AnyReportDef, path = '/report') {
  dom = miniDom(path);
  const store = new Map<string, string>(saved ? [[def.storageKey, JSON.stringify(saved)]] : []);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } });
  dom.render(<NavProvider><ReportWorkbench def={def} /></NavProvider>);
  await flush();
}
const button = (text: string) => dom!.findAll('button').find(b => b.textContent.includes(text));
const inputValues = () => dom!.findAll('input').map(i => String((i as unknown as { value?: unknown }).value ?? ''));

describe('report selection defaults and autoRun', () => {
  it('runs at once with the defaults when autoRun', async () => {
    await open(report({ defaults: () => DEFAULTS, autoRun: true }));
    expect(runs).toEqual([DEFAULTS]);
    expect(dom!.document.textContent).not.toContain('Choose a selection');
  });
  it("merges the last run's values over the defaults", async () => {
    saved = { days: '30' };
    await open(report({ defaults: () => DEFAULTS, autoRun: true }));
    expect(runs).toEqual([{ ...DEFAULTS, days: '30' }]);
  });
  it("runs the URL's selection, not the defaults", async () => {
    await open(report({ defaults: () => DEFAULTS, autoRun: true }), '/report?s.keyDate=2026-01-01&s.days=10');
    expect(runs).toEqual([{ keyDate: '2026-01-01', days: '10' }]);
  });
  it('waits for Run when the merged selection fails its checks, and "Use default selection" runs the defaults', async () => {
    saved = { days: 'abc' };
    await open(report({ defaults: () => DEFAULTS, autoRun: true }));
    expect(runs).toEqual([]);
    expect(dom!.document.textContent).toContain('Choose a selection');
    act(() => dom!.click(button('Use default selection')!));
    await flush();
    expect(runs).toEqual([DEFAULTS]);
    expect(window.location.search).toBe('?s.keyDate=2026-10-31&s.days=60&s.status=A');
  });
  it('fills the form with the defaults but waits for Run without autoRun', async () => {
    await open(report({ defaults: () => DEFAULTS }));
    expect(runs).toEqual([]);
    expect(inputValues()).toEqual(expect.arrayContaining(['60', 'A']));
    act(() => dom!.click(button('Use default selection')!));
    await flush();
    expect(runs).toEqual([DEFAULTS]);
  });
  it('a report without defaults or autoRun waits for Run with an empty form, as before', async () => {
    await open(report());
    expect(runs).toEqual([]);
    expect(button('Use default selection')).toBeUndefined();
    expect(dom!.document.textContent).toContain('Choose a selection');
    expect(inputValues().filter(Boolean)).toEqual([]);
  });
});
