// tests/unit/normal-shell.test.tsx
// The Normal theme's frame (components/normal/): sidebar navigation built from the catalogue, the shell's markup,
// the mobile menu, the theme toggle and a folder route that opens its first application.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pages, resolveTrail, visiblePages, type CatalogPage } from '@/config/catalog';
import { CatalogView } from '@/components/shell/CatalogView';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { ILLUSTRATIONS, Illustration } from '@/components/normal/Illustration';
import { NormalShell } from '@/components/normal/NormalShell';
import { firstApplicationHref, normalNavigation } from '@/components/normal/navigation';
import { PageHeader } from '@/components/normal/PageHeader';
import { NodeIcon } from '@/components/ui/icons';
import { NavProvider } from '@/lib/client/nav';
import type { WorkspaceInfo } from '@/lib/workspace-types';
import { miniDom } from '../support/mini-dom';

// CatalogView reads the theme from runtime.ts; these tests are about the Normal one.
vi.mock('@/runtime', async original => ({ ...(await original<typeof import('@/runtime')>()), APP_THEME: 'normal' }));

const workspace: WorkspaceInfo = {
  session: null, systemId: 'TEST', client: '100', relayUrl: 'http://localhost:3001', usesSap: false, services: [], gallery: true
};
const settings = pages.find(p => p.id === 'settings')!;
const catalogue: CatalogPage[] = [
  { id: 'overview', title: 'Overview', short: 'Overview', icon: 'overview', type: 'overview', code: 'X', description: 'At a glance.' },
  {
    id: 'loans', title: 'Loans', short: 'Loans', icon: 'loans', type: 'folder', code: 'X', description: 'Loan book.',
    children: [
      { id: 'deals', title: 'Deals', type: 'application', icon: 'deals', description: 'Every deal.' },
      { id: 'more', title: 'More', type: 'folder', description: 'Nested.', children: [{ id: 'fees', title: 'Fees', type: 'application', icon: 'fees', description: 'Fee lines.' }] }
    ]
  },
  { id: 'samples', title: 'Samples', short: 'Samples', icon: 'samples', type: 'folder', code: 'X', devOnly: true, description: 'Samples.', children: [{ id: 'demo', title: 'Demo', type: 'application', devOnly: true, description: 'Demo.' }] },
  settings
];
const shell = (pathname: string) => {
  vi.stubGlobal('location', { pathname, search: '' });
  return renderToStaticMarkup(<NavProvider><WorkspaceProvider initial={workspace}><NormalShell><p>Page body</p></NormalShell></WorkspaceProvider></NavProvider>);
};

afterEach(() => { vi.unstubAllGlobals(); });

describe('normalNavigation', () => {
  const groups = normalNavigation(catalogue);
  it('makes the overview a Dashboard group with one item', () => {
    expect(groups[0]).toEqual({ label: 'Dashboard', items: [{ id: 'overview', label: 'Overview', icon: 'overview', href: '/', description: 'At a glance.' }] });
  });
  it('with no overview page the sidebar has no Dashboard group', () => {
    const noHome = normalNavigation(catalogue.filter(p => p.type !== 'overview'));
    expect(noHome.map(g => g.label)).not.toContain('Dashboard');
    expect(noHome[0].items[0].href).toBe('/loans/deals');
  });
  it('makes each folder a group of its applications, nested folders flattened into it', () => {
    const loans = groups.find(g => g.label === 'Loans')!;
    expect(loans.items.map(i => i.href)).toEqual(['/loans/deals', '/loans/more/fees']);
    expect(loans.items.map(i => i.label)).toEqual(['Deals', 'Fees']);
    expect(loans.items[1]).toMatchObject({ icon: 'fees', description: 'Fee lines.' });
  });
  it('makes Settings the Administration group', () => {
    expect(groups.at(-1)!.label).toBe('Administration');
    expect(groups.at(-1)!.items.map(i => i.href)).toEqual(settings.children!.map(c => `/settings/${c.id}`));
  });
  it('shows developer-only pages as visiblePages does', () => {
    expect(groups.map(g => g.label)).toEqual(['Dashboard', 'Loans', 'Samples', 'Administration']);
    expect(normalNavigation(visiblePages(false, catalogue)).map(g => g.label)).toEqual(['Dashboard', 'Loans', 'Administration']);
    expect(normalNavigation(catalogue, false).map(g => g.label)).toEqual(['Dashboard', 'Loans', 'Administration']);
  });
  it('never lists a folder', () => {
    for (const item of normalNavigation(pages).flatMap(g => g.items)) {
      const { current, invalid } = resolveTrail(item.href.split('/').filter(Boolean));
      expect(invalid, item.href).toBe(false);
      expect(current.type, item.href).not.toBe('folder');
    }
  });
  it('finds the first application of a folder, nested ones included', () => {
    const loans = catalogue[1];
    expect(firstApplicationHref([loans])).toBe('/loans/deals');
    expect(firstApplicationHref([loans, loans.children![1]])).toBe('/loans/more/fees');
    expect(firstApplicationHref([{ ...loans, children: [] }])).toBeNull();
  });
});

describe('NormalShell', () => {
  it('draws the LAS frame: navbar, sidebar, page heading with its illustration and footer', () => {
    const html = shell('/settings/appearance');
    expect(html).toMatch(/<div class="nt-app nt-nav-collapsed">/);
    expect(html).toMatch(/<header class="nt-topbar"/);
    expect(html).toMatch(/<aside id="workspace-navigation" class="nt-sidebar"/);
    expect(html).toMatch(/<header class="nt-page-heading">.*<svg class="nt-illo/s);
    expect(html).toMatch(/<footer class="nt-page-footer">/);
    expect(html).toContain('<h1 class="nt-page-title">Appearance</h1>');
    expect(html).toContain('Page body');
  });
  it('has no tiles', () => {
    const html = shell('/');
    expect(html).not.toMatch(/class="[^"]*\btile\b/);
    expect(html).not.toContain('tile-grid');
    expect(html).not.toContain('APPLICATIONS &amp; FOLDERS');
  });
  it('marks the open application in the sidebar', () => {
    const html = shell('/settings/appearance');
    expect(html).toMatch(/<button data-href="\/settings\/appearance"[^>]*class="nt-active" aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(2); // the sidebar item and the last breadcrumb
  });
  it('opens the sidebar from the menu button and closes it from the backdrop', () => {
    const dom = miniDom('/settings/appearance');
    dom.render(<NavProvider><WorkspaceProvider initial={workspace}><NormalShell><p>Page body</p></NormalShell></WorkspaceProvider></NavProvider>);
    expect(dom.find('aside.nt-sidebar').classList.contains('open')).toBe(false);
    expect(dom.findAll('button.nt-sidebar-backdrop')).toHaveLength(0);
    dom.click(dom.find('button.nt-mobile-menu'));
    expect(dom.find('aside.nt-sidebar').classList.contains('open')).toBe(true);
    dom.click(dom.find('button.nt-sidebar-backdrop'));
    expect(dom.find('aside.nt-sidebar').classList.contains('open')).toBe(false);
    dom.unmount();
  });
  it('switches between day and night from the theme toggle', () => {
    const dom = miniDom('/');
    dom.document.documentElement.dataset.theme = 'light';
    dom.render(<NavProvider><WorkspaceProvider initial={workspace}><NormalShell><p>Page body</p></NormalShell></WorkspaceProvider></NavProvider>);
    dom.click(dom.find('button.nt-theme-toggle'));
    expect(dom.document.documentElement.dataset.theme).toBe('dark');
    dom.click(dom.find('button.nt-theme-toggle'));
    expect(dom.document.documentElement.dataset.theme).toBe('light');
    dom.unmount();
  });
  it('a sidebar item opens its page and closes the menu', () => {
    const dom = miniDom('/settings/appearance');
    dom.render(<NavProvider><WorkspaceProvider initial={workspace}><NormalShell><p>Page body</p></NormalShell></WorkspaceProvider></NavProvider>);
    dom.click(dom.find('button.nt-mobile-menu'));
    const item = dom.findAll('button').find(b => b.getAttribute('data-href') === '/settings/sap-connection')!;
    dom.click(item);
    expect(location.pathname).toBe('/settings/sap-connection');
    expect(dom.find('aside.nt-sidebar').classList.contains('open')).toBe(false);
    dom.unmount();
  });
});

describe('Normal: a page that does not exist, and the UI Gallery', () => {
  const company = (html: string) => /<span class="nt-topbar-company"[^>]*>(?:<svg.*?<\/svg>)?(.*?)<\/span>/s.exec(html)?.[1];
  it('an invalid path highlights no sidebar entry and names no catalogue page in the navbar', () => {
    const html = shell('/missing/route');
    expect(html).not.toContain('nt-active');
    expect(html).not.toMatch(/<button data-href[^>]*aria-current/);
    expect(company(html)).toBe('Page not found');
  });
  it('/gallery names the UI Gallery in the navbar and highlights no sidebar entry', () => {
    const html = shell('/gallery');
    expect(html).not.toContain('nt-active');
    expect(company(html)).toBe('UI Gallery');
  });
  it('a real page still names its catalogue page and is highlighted', () => {
    const html = shell('/settings/appearance');
    expect(html).toContain('nt-active');
    expect(company(html)).toBe(settings.short);
  });
  it('says "Page not found" in one heading: the shell header, while CatalogView keeps only its return button', () => {
    vi.stubGlobal('location', { pathname: '/missing', search: '' });
    const html = renderToStaticMarkup(<NavProvider><WorkspaceProvider initial={workspace}><NormalShell><CatalogView path={['missing']} /></NormalShell></WorkspaceProvider></NavProvider>);
    expect(html.match(/<h1[^>]*>Page not found<\/h1>/g)).toHaveLength(1);
    expect(html).toContain('<h1 class="nt-page-title">Page not found</h1>');
    // The way back names the app's first page, whatever it is: the Overview, or a Home page when the app starts there.
    const first = resolveTrail(['missing'], workspace.gallery).page.title;
    expect(html).toMatch(/<button class="button"[^>]*>Return to [^<]+<\/button>/);
    expect(html).toContain(`>Return to ${first}</button>`);
  });
});

describe('Normal catalogue routes', () => {
  it('a folder route opens its first application', () => {
    const folder = pages.find(p => p.type === 'folder' && !p.devOnly && p.children?.length)!;
    const dom = miniDom(`/${folder.id}`);
    dom.render(<NavProvider><WorkspaceProvider initial={workspace}><CatalogView path={[folder.id]} /></WorkspaceProvider></NavProvider>);
    expect(location.pathname).toBe(firstApplicationHref([folder]));
    expect(dom.findAll('.tile')).toHaveLength(0);
    dom.unmount();
  });
});

describe('PageHeader and Illustration', () => {
  it('shows the trail, title, description and illustration', () => {
    const trail = resolveTrail(['settings', 'appearance']).trail;
    const html = renderToStaticMarkup(<PageHeader trail={trail} title="Appearance" description="Light or dark." illustration="processing" actions={<button>Act</button>} />);
    expect(html).toContain('<li><span>Settings</span>');
    expect(html).toContain('<span aria-current="page">Appearance</span>');
    expect(html).toContain('<p>Light or dark.</p>');
    expect(html).toContain('<div class="nt-heading-actions"><button>Act</button></div>');
    expect(html).toMatch(/<div class="nt-page-illustration"><svg class="nt-illo"/);
  });
  it('leads with the page icon tile: the icon of the catalogue node, as the sidebar shows it', () => {
    const trail = resolveTrail(['settings', 'appearance']).trail;
    const html = renderToStaticMarkup(<PageHeader trail={trail} title="Appearance" illustration="processing" />);
    const icon = renderToStaticMarkup(<NodeIcon node={trail.at(-1)!} size={22} />);
    expect(icon).toContain('lucide-palette');
    expect(html).toContain(`<div class="nt-surface-arches" aria-hidden="true"></div><span class="nt-page-icon" aria-hidden="true">${icon}</span><div class="nt-page-heading-text">`);
    expect(renderToStaticMarkup(<PageHeader trail={[]} title="Page not found" illustration="search" />)).not.toContain('nt-page-icon');
  });
  it('has the 13 LAS pictures, decorative unless labelled', () => {
    expect(ILLUSTRATIONS).toEqual(['empty', 'search', 'success', 'error', 'processing', 'collateral', 'customers', 'approval', 'analytics', 'wallet', 'onboarding', 'drawdown', 'bank']);
    for (const name of ILLUSTRATIONS) {
      const html = renderToStaticMarkup(<Illustration name={name} />);
      expect(html, name).toMatch(/^<svg class="nt-illo" viewBox="0 0 200 140" width="160" height="112" aria-hidden="true" focusable="false">/);
      expect(html, name).toContain('<ellipse class="nt-p"');
    }
    expect(renderToStaticMarkup(<Illustration name="success" size={100} label="Saved" />)).toContain('width="100" height="70" role="img" aria-label="Saved"');
  });
});
