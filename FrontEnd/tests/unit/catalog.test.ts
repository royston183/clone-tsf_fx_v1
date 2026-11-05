import { describe, expect, it } from 'vitest';
import { applicationPages, applications, applicationsOf, hrefOf, hrefOfModule, pages, resolveTrail, visiblePages, type CatalogNode, type CatalogPage } from '@/config/catalog';
import { iconOf, ICONS } from '@/components/ui/icons';
import { MODULES } from '@/modules/registry';

// The catalogue's rules, checked on a fixture catalogue (FIXTURE) and as invariants of the real one (`pages`), so they
// hold in the template and in every application made from it, whatever pages it has.
const FIXTURE: CatalogPage[] = [
  { id: 'overview', title: 'Overview', short: 'Overview', icon: 'overview', type: 'overview', code: 'X', description: 'Home.' },
  {
    id: 'books', title: 'Books', short: 'Books', icon: 'accounting', type: 'folder', code: 'X', description: 'A folder.',
    children: [
      { id: 'ledger', title: 'Ledger', type: 'application', icon: 'journal', module: 'test-ledger', description: 'An application.' },
      { id: 'nested', title: 'Nested', type: 'folder', icon: 'folder', description: 'A folder in a folder.', children: [
        { id: 'deep', title: 'Deep', type: 'application', icon: 'reports', module: 'test-deep', description: 'Two levels down.' }
      ] }
    ]
  },
  {
    id: 'lab', title: 'Lab', short: 'Lab', icon: 'samples', type: 'folder', code: 'X', devOnly: true, description: 'Gallery only.',
    children: [{ id: 'trial', title: 'Trial', type: 'application', icon: 'deals', module: 'test-trial', devOnly: true, description: 'A sample.' }]
  },
  { id: 'settings', title: 'Settings', short: 'Settings', icon: 'settings', type: 'folder', code: 'X', description: 'Settings.', children: [] }
];
/** Every node of a catalogue with the ids of its trail. */
const walk = (nodes: CatalogNode[], parents: string[] = []): { node: CatalogNode; ids: string[] }[] =>
  nodes.flatMap(n => [{ node: n, ids: [...parents, n.id] }, ...walk(n.children ?? [], [...parents, n.id])]);

describe('catalog', () => {
  it('removes Samples and its routes from the application catalogue', () => {
    expect(applicationPages.some(page => page.id === 'samples')).toBe(false);
    expect(resolveTrail(['samples'], true, applicationPages).invalid).toBe(true);
    expect(resolveTrail(['samples', 'deals'], true, applicationPages).invalid).toBe(true);
  });
  it('finds the URL of a module, samples included', () => {
    expect(hrefOfModule('test-ledger', FIXTURE)).toBe('/books/ledger');
    expect(hrefOfModule('test-deep', FIXTURE)).toBe('/books/nested/deep');
    expect(hrefOfModule('test-trial', FIXTURE)).toBe('/lab/trial');
    expect(hrefOfModule('nope', FIXTURE)).toBeNull();
    expect(resolveTrail(['lab', 'trial'], false, FIXTURE).invalid).toBe(true);
  });
  it('resolves the overview for the root path', () => {
    const r = resolveTrail([]);
    expect(r.current.id).toBe('overview');
    expect(r.invalid).toBe(false);
    expect(resolveTrail([], true, FIXTURE).current.id).toBe('overview');
  });
  it('with no overview page, / opens the first page and is not invalid', () => {
    const NO_HOME: CatalogPage[] = [
      { id: 'loans', title: 'Loans', short: 'Loans', icon: 'loans', type: 'folder', code: 'X', description: 'Loan book.', children: [{ id: 'requests', title: 'Requests', type: 'application', icon: 'deals', module: 'x', description: 'Requests.' }] },
      FIXTURE[3]
    ];
    for (const gallery of [true, false]) {
      const r = resolveTrail([], gallery, NO_HOME);
      expect(r.current.id).toBe('loans');
      expect(r.page.id).toBe('loans');
      expect(r.invalid).toBe(false);
    }
    // The tile Sidebar links every page but the overview to /<id> and marks page.id active, so the first page is active at /.
    expect(hrefOf([NO_HOME[0].id])).toBe('/loans');
  });
  it('resolves nested applications', () => {
    const r = resolveTrail(['books', 'nested', 'deep'], true, FIXTURE);
    expect(r.trail.map(n => n.id)).toEqual(['books', 'nested', 'deep']);
    expect(r.current.module).toBe('test-deep');
  });
  it('flags unknown paths', () => {
    expect(resolveTrail(['nope']).invalid).toBe(true);
    expect(resolveTrail([pages[0].id, 'nope']).invalid).toBe(true);
    expect(resolveTrail(['books', 'nope'], true, FIXTURE).invalid).toBe(true);
  });
  it('lists applications with their URLs', () => {
    expect(applicationsOf(FIXTURE).map(a => a.href)).toEqual(['/books/ledger', '/books/nested/deep']);
    expect(hrefOf(['settings', 'appearance'])).toBe('/settings/appearance');
    expect(applications.map(a => a.href)).toEqual(applicationsOf(pages).map(a => a.href));
  });
  it('shows a developer page and its applications only with the Gallery', () => {
    expect(visiblePages(false, FIXTURE).map(p => p.id)).toEqual(['overview', 'books', 'settings']);
    expect(resolveTrail(['lab', 'trial'], false, FIXTURE).invalid).toBe(true);
    expect(resolveTrail(['lab', 'trial'], true, FIXTURE).current.module).toBe('test-trial');
    expect(applications.some(a => a.devOnly)).toBe(false);
  });

  // Invariants of the real catalogue.
  it('starts with the Overview and resolves every node by its own URL', () => {
    expect(pages[0].type).toBe('overview');
    for (const { node, ids } of walk(pages)) {
      const r = resolveTrail(ids, true);
      expect(r.invalid, ids.join('/')).toBe(false);
      expect(r.current, ids.join('/')).toBe(node);
    }
    for (const a of applications) expect(resolveTrail(a.href.split('/').filter(Boolean), false).invalid, a.href).toBe(false);
  });
  it('opens every registered module from the application that names it', () => {
    for (const { node, ids } of walk(pages)) {
      if (node.type === 'application' && node.module) expect(hrefOfModule(node.module), node.module).toBe(hrefOf(ids));
    }
    for (const { node } of walk(pages)) if (node.module) expect(Object.hasOwn(MODULES, node.module), `${node.id}: module ${node.module} is registered`).toBe(true);
  });
  it('hides every developer node without the Gallery', () => {
    for (const { node, ids } of walk(pages)) if (node.devOnly) expect(resolveTrail(ids, false).invalid, ids.join('/')).toBe(true);
  });
});

describe('catalogue icons', () => {
  it('names only known icons, each its own lucide icon', () => {
    for (const { node, ids } of walk(pages)) if (node.icon) expect(Object.hasOwn(ICONS, node.icon), `${ids.join('/')}: ${node.icon}`).toBe(true);
    expect(new Set(Object.values(ICONS)).size).toBe(Object.keys(ICONS).length);
  });
  it('gives every rail page its own icon', () => {
    expect(new Set(pages.map(p => iconOf(p))).size, pages.map(p => `${p.id}: ${p.icon}`).join(', ')).toBe(pages.length);
  });
  it('never gives two siblings the same icon', () => {
    for (const { node, ids } of walk(pages)) {
      const kids = node.children ?? [];
      expect(new Set(kids.map(k => iconOf(k))).size, `${ids.join('/')}: ${kids.map(k => `${k.id} ${k.icon ?? '(none)'}`).join(', ')}`).toBe(kids.length);
    }
  });
});
