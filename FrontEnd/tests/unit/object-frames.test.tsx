// A record opens as a pop-up, a page (in place of the list) or a wizard (the header form, then a step per tab); the same
// header, facts, notice and footer in each. The unit tests have no DOM, so state is driven through the controlled
// ObjectFrame (the tab / step it is given) and the pure helpers that pick and navigate frames.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { frameOf, objectFooter } from '@/components/object/ObjectEditor';
import { hidesList, recordFrame } from '@/components/object/ObjectWorkbench';
import { ObjectDialog, ObjectFrame, wizardStepsOf, type ObjectDialogTab } from '@/components/ui/ObjectDialog';
import type { AnyObjectDef } from '@/modules/types';

vi.mock('react-dom', async original => ({ ...(await original<typeof import('react-dom')>()), createPortal: (node: ReactNode) => node }));
beforeAll(() => { vi.stubGlobal('document', { body: {}, activeElement: null }); });
afterAll(() => { vi.unstubAllGlobals(); });

const tabs: ObjectDialogTab[] = [
  { id: 'a', label: 'A', content: <p>Body A</p> }, { id: 'b', label: 'B', content: <p>Body B</p> }, { id: 'c', label: 'C', content: <p>Body C</p> }
];
const common = {
  eyebrow: 'Loan', title: 'L-1', subtitle: 'Ravi', facts: [{ label: 'Amount', value: '10' }], notice: <b>Problem</b>,
  footer: <button>Close</button>, footerStart: <button>Delete</button>, onClose: () => {}
};
const labels = (html: string) => [...html.matchAll(/<li[^>]*><span>[^<]*(?:<svg.*?<\/svg>)?<\/span><b>([^<]+)<\/b>/g)].map(m => m[1]);

describe('the page frame', () => {
  const html = renderToStaticMarkup(<ObjectDialog {...common} tabs={tabs} frame="page" head={<i>Head form</i>} />);
  it('shows header, facts, notice, tabs and footer actions in a section, not a dialog', () => {
    expect(html).toContain('<section class="kit-record-page"');
    expect(html).not.toContain('role="dialog"');
    for (const part of ['L-1', 'Ravi', 'kit-facts', 'Problem', 'role="tablist"', 'Head form', 'Body A', '<button>Close</button>', '<button>Delete</button>']) expect(html).toContain(part);
  });
});
describe('the pop-up frame', () => {
  it('is the default and keeps the dialog', () => {
    for (const html of [renderToStaticMarkup(<ObjectDialog {...common} tabs={tabs} />), renderToStaticMarkup(<ObjectDialog {...common} tabs={tabs} frame="popup" />)]) {
      expect(html).toContain('role="dialog"');
      expect(html).not.toContain('kit-record-page');
    }
  });
});
describe('the wizard frame', () => {
  const wizard = (frame: ReactNode) => renderToStaticMarkup(frame as never);
  it('starts on Details with the steps Details, A, B, C, and only Next', () => {
    const html = renderToStaticMarkup(<ObjectDialog {...common} tabs={tabs} frame="wizard" head={<i>Head form</i>}
      footer={({ last }) => (last ? <button>Save</button> : <button>Cancel</button>)} />);
    expect(html).toContain('<section class="kit-record-page kit-record-wizard"');
    expect(html).toContain('<ol class="kit-wizard"');
    expect(labels(html)).toEqual(['Details', 'A', 'B', 'C']);
    expect(html).toContain('Head form');
    expect(html).not.toContain('Body A');
    expect(html).toContain('>Next</button>');
    expect(html).not.toMatch(/>Back<\/button>/);
    expect(html).not.toContain('Save');
  });
  it('moves one step with Next and Back, and Save shows only on the last step', () => {
    const at = (tab: string) => wizard(<ObjectFrame {...common} frame="wizard" head={<i>Head form</i>} steps={wizardStepsOf(tabs, <i>Head form</i>)} tab={tab} onTab={() => {}} />);
    const middle = at('a');
    expect(labels(middle)).toEqual(['Details', 'A', 'B', 'C']);
    expect(middle).toContain('Body A');
    expect(middle).toContain('class="complete"');
    expect(middle).toContain('>Back</button>');
    expect(middle).toContain('>Next</button>');
    const last = at('c');
    expect(last).toContain('Body C');
    expect(last).toContain('>Back</button>');
    expect(last).not.toContain('>Next</button>');
    const def = { noun: ['Loan', 'Loans'] } as unknown as AnyObjectDef;
    const on = { close: () => {}, edit: () => {}, delete: () => {}, action: () => {}, cancel: () => {}, save: () => {} };
    const foot = (hidePrimary: boolean) => renderToStaticMarkup(<>{objectFooter({ def, header: {}, mode: 'create', busy: false, hidePrimary, on }).footer}</>);
    expect(foot(true)).not.toContain('Create Loan');
    expect(foot(false)).toContain('Create Loan');
  });
  it('leaves out a step that wizardSkip skips, never the first', () => {
    const skip = (id: string) => id === 'b';
    expect(wizardStepsOf(tabs, null, skip).map(s => s.id)).toEqual(['head', 'a', 'c']);
    expect(wizardStepsOf(tabs, null, () => true).map(s => s.id)).toEqual(['head']);
    const html = renderToStaticMarkup(<ObjectDialog {...common} tabs={tabs} frame="wizard" skip={skip} />);
    expect(labels(html)).toEqual(['Details', 'A', 'C']);
  });
});
describe('which frame a record uses', () => {
  const def = { opens: { create: 'wizard', open: 'page' } } as unknown as AnyObjectDef;
  it('uses create for a new record and open for an existing one; a wizard read-only becomes a page', () => {
    expect(recordFrame(def, true)).toBe('wizard');
    expect(recordFrame(def, false)).toBe('page');
    expect(frameOf('wizard', 'display')).toBe('page');
    expect(frameOf('wizard', 'edit')).toBe('wizard');
    expect(frameOf('wizard', 'create')).toBe('wizard');
    expect(frameOf('popup', 'display')).toBe('popup');
  });
  it('hides the list for a page or wizard, never for a pop-up', () => {
    expect(hidesList('page')).toBe(true);
    expect(hidesList('wizard')).toBe(true);
    expect(hidesList('popup')).toBe(false);
  });
});
