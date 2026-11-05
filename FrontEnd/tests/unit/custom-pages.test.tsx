import { lazy } from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pages, resolveTrail, type CatalogNode } from '@/config/catalog';
import { CUSTOM_PAGES, type CustomPageProps } from '@/pages/registry';
import { CatalogView } from '@/components/shell/CatalogView';
import { CustomPageView } from '@/components/shell/CustomPageView';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { NavProvider } from '@/lib/client/nav';
import type { WorkspaceInfo } from '@/lib/workspace-types';

// These tests are about the Tile catalogue, so they pin the Tile theme; an app made with the Normal theme sets APP_THEME to 'normal'.
vi.mock('@/runtime', async original => ({ ...(await original<typeof import('@/runtime')>()), APP_THEME: 'tiles' }));

const workspace: WorkspaceInfo = {
  session: null, systemId: 'TEST', client: '100', relayUrl: 'http://localhost:3001', usesSap: false, services: [], gallery: true
};
// The first folder of the real catalogue (the template's Master Data, or an application's own first folder), and its
// first entry: the tests hold whatever pages the catalogue has.
const folder = pages.find(p => p.type === 'folder' && p.children?.length) ?? pages.find(p => p.children)!;
const entry = folder.children![0];
/** Text as React writes it into markup. */
const escaped = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
const custom: CatalogNode = {
  id: 'custom', title: 'Custom portfolio', description: 'A requested layout.', type: 'application', page: 'test-portfolio'
};
function Portfolio({ node, trail }: CustomPageProps) {
  return <section aria-label="Requested layout"><h2>{node.title} layout</h2><p>{trail.map(n => n.id).join(' / ')}</p></section>;
}
function catalog(path: string[]) {
  return renderToStaticMarkup(<NavProvider><WorkspaceProvider initial={workspace}><CatalogView path={path} /></WorkspaceProvider></NavProvider>);
}

beforeEach(() => {
  vi.stubGlobal('location', { pathname: '/', search: '' });
  CUSTOM_PAGES['test-portfolio'] = Portfolio;
});
afterEach(() => {
  delete CUSTOM_PAGES['test-portfolio'];
  vi.unstubAllGlobals();
});

describe('custom pages', () => {
  it('renders the registered layout with its catalogue node and breadcrumb trail', () => {
    const html = renderToStaticMarkup(<CustomPageView node={custom} trail={[folder, custom]} />);
    expect(html).toContain('Custom portfolio layout');
    expect(html).toContain(`${folder.id} / custom`);
  });
  it.each(['missing', 'toString'])('shows an unavailable page for an unregistered id: %s', page => {
    const html = renderToStaticMarkup(<CustomPageView node={{ ...custom, page }} trail={[custom]} />);
    expect(html).toContain('This page is not available yet');
    expect(html).toContain('src/pages/registry.ts');
  });
  it('supports lazy pages within the loading boundary', async () => {
    CUSTOM_PAGES['test-portfolio'] = lazy(async () => ({ default: Portfolio }));
    const html = await new Promise<string>((resolve, reject) => {
      let markup = '';
      const sink = new Writable({ write(chunk, _encoding, done) { markup += String(chunk); done(); } });
      sink.on('finish', () => resolve(markup));
      sink.on('error', reject);
      const stream = renderToPipeableStream(<CustomPageView node={custom} trail={[custom]} />, {
        onAllReady() { stream.pipe(sink); }, onError: reject
      });
    });
    expect(html.replace(/<!--.*?-->/g, '')).toContain('Custom portfolio layout');
  });
  it('opens a custom application through its catalogue URL with the default heading', () => {
    folder.children!.push(custom);
    try {
      expect(resolveTrail([folder.id, 'custom']).invalid).toBe(false);
      const html = catalog([folder.id, 'custom']);
      expect(html).toContain('<h1>Custom portfolio</h1>');
      expect(html).toContain('Custom portfolio layout');
      expect(html).not.toContain('No module is registered');
    } finally { folder.children!.pop(); }
  });
  it.each([0, pages.indexOf(folder), pages.length - 1])('can replace an overview or folder and supply its own heading (page %s)', index => {
    const original = pages[index];
    pages[index] = { ...original, page: 'test-portfolio', heading: 'custom' };
    try {
      const html = catalog([original.id]);
      expect(html).toContain('Requested layout');
      expect(html).not.toContain('class="page-heading"');
      expect(html).not.toContain('Search applications and folders');
      expect(html).not.toContain('class="tile');
    } finally { pages[index] = original; }
  });
  it('keeps tile navigation and the standard heading for uncustomized pages', () => {
    const html = catalog([folder.id]);
    expect(html).toContain('class="page-heading"');
    expect(html).toContain('Search applications and folders');
    expect(html).toContain(escaped(entry.title));
    expect(html).toContain(`/${folder.id}/${entry.id}`);
    expect(html).toContain('class="tile');
    expect(html).not.toContain('Requested layout');
  });
  it('retains not-found handling and hidden sample access checks', () => {
    expect(catalog(['missing'])).toContain('Page not found');
    expect(resolveTrail(['samples', 'deals'], false).invalid).toBe(true);
  });
});
