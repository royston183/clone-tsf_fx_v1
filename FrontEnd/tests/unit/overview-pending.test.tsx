// tests/unit/overview-pending.test.tsx
// The Tile theme's Overview (components/shell/Overview.tsx): "Overview not built yet" when the catalogue's home has
// no dashboard; application tiles only while searching.
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applications, pages } from '@/config/catalog';
import { Overview } from '@/components/shell/Overview';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { NavProvider } from '@/lib/client/nav';
import type { WorkspaceInfo } from '@/lib/workspace-types';
import { miniDom, type MiniDom } from '../support/mini-dom';

vi.mock('@/components/dashboard/DashboardView', () => ({ default: () => <div className="stub-dashboard">Dashboard screen</div> }));

const workspace: WorkspaceInfo = {
  session: null, systemId: 'TEST', client: '100', relayUrl: 'http://localhost:3001', usesSap: true, services: [], gallery: false
};
const tree = (node: React.ReactNode) => <NavProvider><WorkspaceProvider initial={workspace}>{node}</WorkspaceProvider></NavProvider>;
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let dom: MiniDom | null = null;
const mount = async (node: React.ReactNode) => { dom?.unmount(); dom = miniDom('/'); dom.render(tree(node)); await settle(); return dom; };
const home = pages.find(p => p.type === 'overview')!;
const savedModule = home.module;
beforeEach(() => { home.module = savedModule; });
afterEach(() => { dom?.unmount(); dom = null; home.module = savedModule; });

describe('Overview (Tile theme)', () => {
  it('shows "Overview not built yet" and no stat or connection cards when the home has no dashboard', async () => {
    home.module = undefined;
    const d = await mount(<Overview query="" />);
    expect(d.document.textContent).toContain('Overview not built yet');
    expect(d.findAll('.overview-stat')).toHaveLength(0);
    expect(d.findAll('.overview-connection')).toHaveLength(0);
  });
  it('shows the dashboard when the home has one', async () => {
    const d = await mount(<Overview query="" />);
    expect(d.findAll('.stub-dashboard')).toHaveLength(1);
    expect(d.document.textContent).not.toContain('Overview not built yet');
  });
  it('shows only matching application tiles while searching', async () => {
    home.module = undefined;
    const d = await mount(<Overview query={applications[0].title} />);
    expect(d.findAll('.tile').length).toBeGreaterThan(0);
    expect(d.document.textContent).not.toContain('Overview not built yet');
  });
});
