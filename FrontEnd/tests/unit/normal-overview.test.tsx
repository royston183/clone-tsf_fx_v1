// tests/unit/normal-overview.test.tsx
// The Normal theme's Overview (components/normal/NormalOverview.tsx) and KPI card (KpiCard.tsx): the dashboard when
// the catalogue's home has one, else "Overview not built yet"; application links only while searching. Never any tiles.
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applications, pages, visiblePages } from '@/config/catalog';
import { CatalogView } from '@/components/shell/CatalogView';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { KpiCard } from '@/components/normal/KpiCard';
import { NormalOverview } from '@/components/normal/NormalOverview';
import { NormalShell } from '@/components/normal/NormalShell';
import { NavProvider } from '@/lib/client/nav';
import type { WorkspaceInfo } from '@/lib/workspace-types';
import { miniDom, type MiniDom } from '../support/mini-dom';

// CatalogView reads the theme from runtime.ts; these tests are about the Normal one.
vi.mock('@/runtime', async original => ({ ...(await original<typeof import('@/runtime')>()), APP_THEME: 'normal' }));
// The dashboard screen itself is tested elsewhere; here only that the Overview shows it.
vi.mock('@/components/dashboard/DashboardView', () => ({ default: () => <div className="stub-dashboard">Dashboard screen</div> }));

const workspace: WorkspaceInfo = {
  session: null, systemId: 'TEST', client: '100', relayUrl: 'http://localhost:3001', usesSap: true, services: [], gallery: false
};
const tree = (node: React.ReactNode) => <NavProvider><WorkspaceProvider initial={workspace}>{node}</WorkspaceProvider></NavProvider>;
const hasTiles = (dom: MiniDom) => dom.findAll('.tile').length + dom.findAll('.tile-grid').length;
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let dom: MiniDom | null = null;
const mount = async (node: React.ReactNode, path = '/') => { dom?.unmount(); dom = miniDom(path); dom.render(tree(node)); await settle(); return dom; };
const home = pages.find(p => p.type === 'overview')!;
const savedModule = home.module;
afterEach(() => { dom?.unmount(); dom = null; home.module = savedModule; vi.unstubAllGlobals(); });
beforeEach(() => { home.module = savedModule; });

describe('KpiCard', () => {
  it('shows the title, value and caption, blue by default', () => {
    const html = renderToStaticMarkup(<KpiCard title="Applications" value={7} caption="In this workspace" />);
    expect(html).toContain('class="nt-stat nt-tone-blue"');
    expect(html).toContain('Applications');
    expect(html).toContain('<strong>7</strong>');
    expect(html).toContain('<small>In this workspace</small>');
  });
  it('takes its tone and an icon', () => {
    const html = renderToStaticMarkup(<KpiCard title="SAP" value="Connected" tone="green" icon="connection" />);
    expect(html).toContain('nt-tone-green');
    expect(html).toMatch(/<i class="nt-tone-icon nt-icon-green"><svg/);
    expect(html).toContain('nt-stat-dot');
  });
  it('can be featured', () => {
    expect(renderToStaticMarkup(<KpiCard title="T" value="1" featured />)).toContain('class="nt-stat nt-tone-blue nt-featured"');
  });
});

describe('NormalOverview', () => {
  it('shows the dashboard when the catalogue home has one, without tiles', async () => {
    const d = await mount(<NormalOverview query="" />);
    expect(d.findAll('.stub-dashboard')).toHaveLength(1);
    expect(hasTiles(d)).toBe(0);
  });
  it('shows "Overview not built yet" and no KPI cards when the home has no dashboard', async () => {
    home.module = undefined;
    const d = await mount(<NormalOverview query="" />);
    expect(d.findAll('.stub-dashboard')).toHaveLength(0);
    expect(d.document.textContent).toContain('Overview not built yet');
    expect(d.findAll('.nt-stat')).toHaveLength(0);
    expect(hasTiles(d)).toBe(0);
  });
  it('lists matching applications while searching', async () => {
    home.module = undefined;
    const first = applications[0];
    const d = await mount(<NormalOverview query={first.title} />);
    expect(d.findAll('a.nt-app-link').map(a => a.getAttribute('href'))).toContain(first.href);
    const none = await mount(<NormalOverview query="zzz-no-such-application" />);
    expect(none.findAll('a.nt-app-link')).toHaveLength(0);
    expect(none.document.textContent).toContain('No application matches.');
    expect(d.document.textContent).not.toContain('Overview not built yet');
  });
  it('is what CatalogView draws for the overview, inside NormalShell, with no tiles', async () => {
    home.module = undefined;
    const d = await mount(<NormalShell><CatalogView path={[]} /></NormalShell>);
    expect(d.document.textContent).toContain('Overview not built yet');
    expect(hasTiles(d)).toBe(0);
    expect(visiblePages(false).some(p => p.type === 'overview')).toBe(true);
  });
});
