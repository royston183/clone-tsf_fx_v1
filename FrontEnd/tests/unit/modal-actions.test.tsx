import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ObjectEditor, objectFooter } from '@/components/object/ObjectEditor';
import { Modal } from '@/components/ui/Modal';
import { ObjectDialog } from '@/components/ui/ObjectDialog';
import type { AnyObjectDef } from '@/modules/types';

// Every action button of a pop-up sits in its footer, which stays in view while the body scrolls: none in the body.
// Rendered on the server, where a portal is just its content (and the page's document only its body).
vi.mock('react-dom', async original => ({ ...(await original<typeof import('react-dom')>()), createPortal: (node: ReactNode) => node }));
beforeAll(() => { vi.stubGlobal('document', { body: {}, activeElement: null }); });
afterAll(() => { vi.unstubAllGlobals(); });

const ACTIONS = ['Edit', 'Delete', 'Save', 'Close', 'Cancel', 'Release', 'Create Record'];
/** The text of every button in a piece of markup. */
const buttons = (markup: string) => [...markup.matchAll(/<button\b[^>]*>(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
/** A rendered modal's body and footer. */
function parts(markup: string) {
  const body = markup.indexOf('class="ds-modal-body"'), foot = markup.indexOf('class="ds-modal-foot"');
  expect(body).toBeGreaterThan(-1);
  expect(foot).toBeGreaterThan(body);
  return { body: markup.slice(body, foot), foot: markup.slice(foot) };
}
function expectInFooterOnly(markup: string, expected: string[]) {
  const { body, foot } = parts(markup);
  expect(buttons(body).filter(b => ACTIONS.includes(b))).toEqual([]);
  expect(buttons(foot)).toEqual(expected);
}

const def: AnyObjectDef = {
  kind: 'object', id: 'test-records', title: 'Records', serviceKey: 'test', storageKey: 'test-records', noun: ['Record', 'Records'],
  opens: { create: 'popup', open: 'popup' },
  list: { entity: 'records', keys: ['id'], columns: [{ field: 'id', label: 'ID', text: r => r.id ?? '' }], fields: [{ field: 'id', label: 'ID', type: 'code' }], defaultSort: { field: 'id', dir: 1 } },
  header: [{ field: 'id', label: 'ID', type: 'code', key: true }, { field: 'name', label: 'Name', type: 'text' }],
  tabs: [{ kind: 'fields', id: 'basic', label: 'Basic Data', groups: [{ title: 'Names', fields: [{ field: 'name', label: 'Name', type: 'text' }] }] }],
  actions: [{ id: 'release', label: 'Release', sapAction: 'release', confirm: 'Release it?' }],
  lookups: () => ({})
};
const on = { close: () => {}, edit: () => {}, delete: () => {}, action: () => {}, cancel: () => {}, save: () => {} };
const dialog = (mode: 'display' | 'edit' | 'create') => {
  const { footer, footerStart } = objectFooter({ def, header: { id: 'R1', name: 'One' }, mode, busy: false, on });
  return renderToStaticMarkup(<ObjectDialog eyebrow="Record" title="R1" facts={[{ label: 'ID', value: 'R1' }]} tabs={[{ id: 'basic', label: 'Basic Data', content: <p>Body</p> }]}
    footer={footer} footerStart={footerStart} onClose={() => {}} />);
};

describe('modal actions sit in the footer', () => {
  it('Modal puts footerStart before the footer, both in the footer', () => {
    const html = renderToStaticMarkup(<Modal title="T" onClose={() => {}} footerStart={<button>Delete</button>} footer={<button>Close</button>}><p>Body</p></Modal>);
    expectInFooterOnly(html, ['Delete', 'Close']);
    expect(parts(html).foot).toContain('class="kit-foot-start"');
  });
  it('an object on display: Delete and its actions on the left, Close and Edit on the right', () => {
    const html = dialog('display');
    expectInFooterOnly(html, ['Delete', 'Release', 'Close', 'Edit']);
    expect(parts(html).foot).toMatch(/class="kit-foot-start"><button[^>]*>.*Delete.*Release<\/button><\/div><button[^>]*>Close/);
  });
  it('an object in edit mode: Cancel and Save', () => {
    expectInFooterOnly(dialog('edit'), ['Cancel', 'Save']);
  });
  it('a new object, through the whole editor: Cancel and Create', () => {
    const html = renderToStaticMarkup(<ObjectEditor def={def} lk={{}} objectKey={null} frame="popup" onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} onAction={() => {}} />);
    expectInFooterOnly(html, ['Cancel', 'Create Record']);
  });
  it('an object without Edit or Delete shows neither', () => {
    const { footer, footerStart } = objectFooter({ def: { ...def, canEdit: false, canDelete: false, actions: [] }, header: {}, mode: 'display', busy: false, on });
    expect(buttons(renderToStaticMarkup(<>{footerStart}{footer}</>))).toEqual(['Close']);
  });
});
