// The record pop-up (ModalDisplay / ModalEdit design): compact header, key facts with "—" for empty values, one tab strip
// with keyboard moves, and an edit footer that counts changes and fields to fix with Save disabled while one needs fixing.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { editHint, ObjectEditor, objectFooter } from '@/components/object/ObjectEditor';
import { DisplayValue, ObjectDialog } from '@/components/ui/ObjectDialog';
import { tabAfterKey, Tabs } from '@/components/ui/Tabs';
import type { AnyObjectDef } from '@/modules/types';

vi.mock('react-dom', async original => ({ ...(await original<typeof import('react-dom')>()), createPortal: (node: ReactNode) => node }));
beforeAll(() => { vi.stubGlobal('document', { body: {}, activeElement: null }); });
afterAll(() => { vi.unstubAllGlobals(); });

const def: AnyObjectDef = {
  kind: 'object', id: 'test-loans', title: 'Loans', serviceKey: 'test', storageKey: 'test-loans', noun: ['Loan', 'Loans'],
  opens: { create: 'popup', open: 'popup' },
  list: { entity: 'loans', keys: ['id'], columns: [{ field: 'id', label: 'ID', text: r => r.id ?? '' }], fields: [{ field: 'id', label: 'ID', type: 'code' }], defaultSort: { field: 'id', dir: 1 } },
  header: [{ field: 'id', label: 'ID', type: 'code', key: true }, { field: 'amount', label: 'Amount *', type: 'amount', required: true }],
  tabs: [{ kind: 'fields', id: 'basic', label: 'Details', groups: [{ title: 'Loan', fields: [{ field: 'purpose', label: 'Purpose', type: 'text' }] }] }],
  lookups: () => ({})
};
const on = { close: () => {}, edit: () => {}, delete: () => {}, action: () => {}, cancel: () => {}, save: () => {} };
const saveButton = (markup: string) => /<button class="button"( disabled="")?>(Save|Create Loan)<\/button>/.exec(markup);

describe('the record pop-up', () => {
  it('shows an empty value as a muted dash, in the facts and in a field list', () => {
    expect(renderToStaticMarkup(<DisplayValue>{''}</DisplayValue>)).toBe('<span class="kit-empty">—</span>');
    expect(renderToStaticMarkup(<DisplayValue>10.25%</DisplayValue>)).toBe('10.25%');
    const html = renderToStaticMarkup(<ObjectDialog eyebrow="Drawdown" title="1000 / 4100000231" subtitle="Ravi Kumar" facts={[{ label: 'Amount', value: '2,500,000', num: true }, { label: 'Purpose', value: '' }]}
      tabs={[{ id: 'details', label: 'Details', content: <p>Body</p> }]} footer={<button>Close</button>} onClose={() => {}} />);
    expect(html).toContain('<dt>Purpose</dt><dd><span class="kit-empty">—</span></dd>');
    expect(html).toContain('<dd class="kit-num">2,500,000</dd>');
  });
  it('names the dialog by its eyebrow and key, with a compact record header and no nested frames', () => {
    const html = renderToStaticMarkup(<ObjectDialog eyebrow="Drawdown" title="4100000231" status={<span className="kit-tag">Disbursed</span>}
      tabs={[{ id: 'details', label: 'Details', content: <p>Body</p> }]} footer={<button>Close</button>} onClose={() => {}} />);
    expect(html).toMatch(/class="ds-modal record"/);
    expect(html).toMatch(/aria-labelledby="(\S+) (\S+)"/);
    expect(html).toContain('<span class="kit-tag">Disbursed</span>');
    expect(html).not.toContain('Header details');
    expect(html).not.toContain('ftr-panel');
    expect(html).not.toContain('kit-dialog-section');
  });
  it('makes the selected tab the one Tab stop; every tab controls the panel, labelled by the selected tab', () => {
    const html = renderToStaticMarkup(<Tabs label="Loan details" current="b" onSelect={() => {}} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]}>Panel</Tabs>);
    const tabs = [...html.matchAll(/<button id="([^"]+)" type="button" role="tab" aria-selected="(true|false)" aria-controls="([^"]+)" tabindex="(-?\d)"/g)];
    expect(tabs.map(t => [t[2], t[4]])).toEqual([['false', '-1'], ['true', '0']]);
    const panel = /<div id="([^"]+)" role="tabpanel" aria-labelledby="([^"]+)"/.exec(html);
    expect(tabs.every(t => t[3] === panel?.[1])).toBe(true);
    expect(panel?.[2]).toBe(tabs[1][1]);
  });
  it('moves between tabs with the arrow keys, Home and End', () => {
    const ids = ['details', 'collateral', 'history'];
    expect(tabAfterKey(ids, 'details', 'ArrowRight')).toBe('collateral');
    expect(tabAfterKey(ids, 'history', 'ArrowRight'), 'wraps to the first').toBe('details');
    expect(tabAfterKey(ids, 'details', 'ArrowLeft'), 'wraps to the last').toBe('history');
    expect(tabAfterKey(ids, 'collateral', 'Home')).toBe('details');
    expect(tabAfterKey(ids, 'details', 'End')).toBe('history');
    expect(tabAfterKey(ids, 'details', 'Enter')).toBeNull();
  });
  it('counts changes and fields to fix in the edit footer, and keeps Save disabled while a field needs fixing', () => {
    expect(editHint(2, 1)).toBe('2 changes · 1 field to fix');
    expect(editHint(1, 0)).toBe('1 change · Ctrl+S saves');
    expect(editHint(0, 3)).toBe('No changes yet · 3 fields to fix');
    const html = (toFix: number) => renderToStaticMarkup(<>{objectFooter({ def, header: {}, mode: 'edit', busy: false, changes: 2, toFix, on }).footer}</>);
    expect(html(1)).toContain('2 changes · 1 field to fix');
    expect(saveButton(html(1))?.[1]).toBe(' disabled=""');
    expect(saveButton(html(0))?.[1]).toBeUndefined();
  });
  it('a new record with a required field empty cannot be created yet', () => {
    const html = renderToStaticMarkup(<ObjectEditor def={def} lk={{}} objectKey={null} frame="popup" onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} onAction={() => {}} />);
    expect(html).toContain('No changes yet · 1 field to fix');
    expect(saveButton(html)?.[1]).toBe(' disabled=""');
    expect(html).toContain('<span class="kit-tag">New</span>');
  });
});
