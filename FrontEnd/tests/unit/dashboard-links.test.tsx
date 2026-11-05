import { renderToStaticMarkup as renderReactMarkup } from 'react-dom/server';
import { businessMarkup } from '../support/table-markup';
const renderToStaticMarkup = (node: Parameters<typeof renderReactMarkup>[0]) => businessMarkup(renderReactMarkup(node));
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// No DOM here: hooks are stubbed so SummaryTable can be called directly and its element tree inspected.
vi.mock('react', async orig => ({ ...(await orig<typeof import('react')>()), useState: (v: unknown) => [typeof v === 'function' ? v() : v, () => {}] }));

type El = ReactElement<{ children?: ReactNode; onClick?: (e: { stopPropagation: () => void }) => void; className?: string }>;
const find = (n: ReactNode, test: (e: El) => boolean): El[] => {
  if (Array.isArray(n)) return n.flatMap(c => find(c, test));
  if (!n || typeof n !== 'object' || !('props' in n)) return [];
  const e = n as El;
  return [...(test(e) ? [e] : []), ...find(e.props.children, test)];
};
import { KpiTile } from '@/components/dashboard/KpiTile';
import { SummaryTable, labelClick, rowLink } from '@/components/dashboard/SummaryTable';
import { hrefOfPage, type CatalogNode } from '@/config/catalog';
import { isClickable, isLinkTarget, targetHref } from '@/lib/drill/target';
import type { TableData } from '@/lib/dashboard/types';
import { DEFAULT_UNITS } from '@/lib/report/types';

const [ABSOLUTE] = DEFAULT_UNITS;
const NODES: CatalogNode[] = [
  { id: 'home', title: 'Home', description: '', type: 'overview' },
  { id: 'tools', title: 'Tools', description: '', type: 'folder', children: [{ id: 'board', title: 'Board', description: '', type: 'application', page: 'board' }] }
];
const table = (open?: TableData['rows'][number]['open']): TableData => ({
  columns: [{ id: 'a', label: 'A' }], rows: [{ label: 'Deal D-1', cells: { a: '1' }, open }]
});

describe('hrefOfPage', () => {
  it('finds the node of a custom page and returns null for an unknown page', () => {
    expect(hrefOfPage('board', NODES)).toBe('/tools/board');
    expect(hrefOfPage('nope', NODES)).toBeNull();
  });
});

describe('targetHref', () => {
  it('opens one record of a module with ?open= and the way back', () => {
    expect(targetHref({ kind: 'screen', module: 'sample-deals', filters: {}, open: 'D-1', label: 'Open' }, '/')).toBe('/samples/deals?open=D-1&from=%2F');
  });
  it('opens a page with its params as the query', () => {
    expect(targetHref({ kind: 'page', page: 'board', params: { id: '7' }, label: 'Board' }, null, {}, NODES)).toBe('/tools/board?id=7');
    expect(targetHref({ kind: 'page', page: 'nope', label: 'x' }, null, {}, NODES)).toBeNull();
    expect(isLinkTarget({ kind: 'page', page: 'board', label: 'x' }, NODES)).toBe(true);
    expect(isLinkTarget({ kind: 'screen', module: 'unknown', filters: {}, label: 'x' })).toBe(false);
  });
});

describe('report drill cells', () => {
  it('are clickable for a breakdown and a known screen or page, never for none or an unknown target', () => {
    expect(isClickable({ kind: 'breakdown' })).toBe(true);
    expect(isClickable({ kind: 'none' })).toBe(false);
    expect(isClickable({ kind: 'screen', module: 'sample-deals', filters: {}, label: 'x' })).toBe(true);
    expect(isClickable({ kind: 'screen', module: 'unknown', filters: {}, label: 'x' })).toBe(false);
    expect(isClickable({ kind: 'page', page: 'nope', label: 'x' })).toBe(false);
  });
  it('resolve a page target to the page href with the way back (a registered page is checked in definitions.test)', () => {
    expect(targetHref({ kind: 'page', page: 'board', params: { id: '7' }, label: 'Board' }, '/reports/x?hl=1', {}, NODES)).toBe('/tools/board?id=7&from=%2Freports%2Fx%3Fhl%3D1');
  });
});

describe('dashboard links', () => {
  it('shows a row with an open target as a button, and plain text when it does not resolve or is absent', () => {
    const open = { kind: 'screen' as const, module: 'sample-deals', filters: {}, open: 'D-1', label: 'Open' };
    expect(renderToStaticMarkup(<SummaryTable data={table(open)} unit={ABSOLUTE} onOpen={() => {}} />)).toContain('<button type="button" class="kit-ov-link">Deal D-1</button>');
    expect(renderToStaticMarkup(<SummaryTable data={table({ ...open, module: 'unknown' })} unit={ABSOLUTE} onOpen={() => {}} />)).not.toContain('<button type="button" class="kit-ov-link">');
    expect(renderToStaticMarkup(<SummaryTable data={table()} unit={ABSOLUTE} onOpen={() => {}} />)).not.toContain('<button type="button" class="kit-ov-link">');
  });
  it('makes a tile with a screen target a link and one with an unknown page plain', () => {
    const tile = { label: 'Lines', value: '20', type: 'count' as const };
    expect(renderToStaticMarkup(<KpiTile tile={{ ...tile, drill: { kind: 'screen', module: 'sample-deals', filters: {}, label: 'Open' } }} unit={ABSOLUTE} onOpen={() => {}} />)).toContain('kit-tile-open');
    expect(renderToStaticMarkup(<KpiTile tile={{ ...tile, drill: { kind: 'page', page: 'nope', label: 'Open' } }} unit={ABSOLUTE} onOpen={() => {}} />)).not.toContain('kit-tile-open');
  });
});

describe('summary row links', () => {
  const open = { kind: 'screen' as const, module: 'sample-deals', filters: {}, open: 'D-1', label: 'Open' };
  it('makes the whole row clickable only when it has a resolving open target', () => {
    const calls: unknown[] = [];
    const link = rowLink(open, t => calls.push(t));
    expect(link.className).toBe('kit-row-link');
    link.onClick?.();
    expect(calls).toEqual([open]);
    expect(rowLink(undefined, () => {})).toEqual({ className: '' });
    expect(rowLink({ ...open, module: 'unknown' }, () => {}).onClick).toBeUndefined();
    expect(renderToStaticMarkup(<SummaryTable data={table(open)} unit={ABSOLUTE} onOpen={() => {}} />)).toContain('<tr class="kit-row-link">');
    expect(renderToStaticMarkup(<SummaryTable data={table()} unit={ABSOLUTE} onOpen={() => {}} />)).not.toContain('kit-row-link');
  });
  it('opens once from the label: the click stops before the row', () => {
    const calls: unknown[] = []; let stopped = 0;
    labelClick({ stopPropagation: () => { stopped += 1; } }, open, t => calls.push(t));
    expect(calls).toEqual([open]);
    expect(stopped).toBe(1);
  });
});

describe('SummaryTable row wiring', () => {
  const open = { kind: 'screen' as const, module: 'sample-deals', filters: {}, open: 'D-1', label: 'Open' };
  const tree = (o?: typeof open) => { const calls: unknown[] = []; return { calls, root: SummaryTable({ data: table(o), unit: ABSOLUTE, onOpen: t => calls.push(t) }) as ReactNode }; };
  it('row click opens once; label click opens once and stops before the row', () => {
    const { calls, root } = tree(open);
    const [tr] = find(root, e => e.type === 'tr' && e.props.className === 'kit-row-link');
    tr.props.onClick?.({ stopPropagation() {} });
    expect(calls).toEqual([open]);
    calls.length = 0;
    const [btn] = find(root, e => e.type === 'button' && e.props.className === 'kit-ov-link');
    let stopped = 0;
    btn.props.onClick?.({ stopPropagation: () => { stopped += 1; } });
    expect(stopped).toBe(1);
    expect(calls).toEqual([open]);
  });
  it('a row without open has no row click and no label button', () => {
    const { root } = tree();
    expect(find(root, e => e.type === 'tr' && Boolean(e.props.onClick))).toHaveLength(0);
    expect(find(root, e => e.type === 'button' && e.props.className === 'kit-ov-link')).toHaveLength(0);
  });
});
