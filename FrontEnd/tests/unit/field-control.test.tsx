// tests/unit/field-control.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FieldControl, takeFile } from '@/components/fields/FieldControl';
import type { AnyField } from '@/lib/fields';

const html = (def: AnyField, value = '', extra: Partial<Parameters<typeof FieldControl>[0]> = {}) =>
  renderToStaticMarkup(<FieldControl def={def} variant="form" row={{ [def.field]: value }} lk={{}} onChange={() => {}} {...extra} />);

describe('FieldControl (form)', () => {
  it('wraps the control in ALM .field with its caption and error', () => {
    const out = html({ field: 'a', label: 'Amount', type: 'amount' }, '1234.50', { error: 'Amount is too large.' });
    expect(out).toContain('class="field');
    expect(out).toContain('<span>Amount</span>');
    expect(out.toLowerCase()).toContain('inputmode="text"');
    expect(out).toContain('value="1,234.50"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('Amount is too large.');
  });
  it('renders each type with its ALM control', () => {
    expect(html({ field: 'd', label: 'D', type: 'date' }, '2026-04-01')).toContain('type="date"');
    expect(html({ field: 'f', label: 'F', type: 'toggle' }, 'X')).toContain('md-toggle');
    expect(html({ field: 's', label: 'S', type: 'segmented', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }] }, 'B')).toContain('trm-seg');
    expect(html({ field: 't', label: 'T', type: 'textarea', max: 50 }, 'hi')).toContain('2 / 50');
    expect(html({ field: 'v', label: 'V', type: 'display', computed: () => 'Computed' })).toContain('ftr-val');
    expect(html({ field: 'm', label: 'Period', type: 'period', yearField: 'y' }, '04')).toContain('04 - April');
    expect(html({ field: 'from', label: 'Validity', type: 'dateRange', toField: 'to' })).toContain('kit-range');
    expect(html({ field: 'u', label: 'Upload', type: 'file', accept: ['.xlsx'] })).toContain('kit-drop');
  });
  it('renders computed fields from the cleaned context row, and a file field has one label', () => {
    const def: AnyField = { field: 'v', label: 'V', type: 'display', computed: r => `got ${r.x}` };
    expect(html(def, '', { context: { x: 'clean' } })).toContain('got clean');
    const file = html({ field: 'u', label: 'Upload', type: 'file', accept: ['.xlsx'] });
    expect(file.match(/<label/g)).toHaveLength(1);
    expect(file).toContain('role="button"');
  });
});

describe('FieldControl (read-only)', () => {
  it('marks read-only inputs with kit-readonly in the form and in a cell, and editable ones not', () => {
    const def: AnyField = { field: 'n', label: 'Deal', type: 'code', max: 10 };
    expect(html(def, 'D1', { readOnly: true })).toMatch(/class="mono kit-readonly"[^>]*readOnly|readOnly[^>]*class="mono kit-readonly"/i);
    expect(html(def, 'D1')).not.toContain('kit-readonly');
    const cell = renderToStaticMarkup(<FieldControl def={{ field: 'a', label: 'Amount', type: 'amount' }} variant="cell" row={{ a: '5' }} lk={{}} onChange={() => {}} readOnly />);
    expect(cell).toMatch(/class="ds-cell[^"]*kit-readonly"/);
    expect(renderToStaticMarkup(<FieldControl def={{ field: 'd', label: 'Date', type: 'date' }} variant="form" row={{}} lk={{}} onChange={() => {}} readOnly />)).toContain('kit-readonly');
  });
});

describe('FieldControl (period in a form)', () => {
  it('names the month select by the label, since the label also wraps the year input', () => {
    const out = html({ field: 'm', label: 'Period *', type: 'period', yearField: 'y' }, '04');
    expect(out).toMatch(/<select[^>]*aria-label="Period"/);
    expect(out).toContain('aria-label="Period year"');
  });
});

describe('FieldControl (period year input)', () => {
  const period: AnyField = { field: 'm', label: 'Period', type: 'period', yearField: 'y' };
  const year = (out: string) => /<input[^>]*aria-label="Period year"[^>]*>/.exec(out)?.[0] ?? '';
  it('gets the same classes as the month: read-only, bad and the cell class (dirty)', () => {
    const cell = renderToStaticMarkup(<FieldControl def={period} variant="cell" row={{ m: '04', y: '2026' }} lk={{}} onChange={() => {}} readOnly error="bad" cellClass="md-cell dirty" />);
    expect(year(cell)).toMatch(/class="ds-cell[^"]*\bbad\b[^"]*md-cell dirty[^"]*kit-readonly"/);
    expect(year(html(period, '04', { readOnly: true }))).toContain('class="kit-readonly"');
    expect(year(html(period, '04'))).not.toContain('class=');
  });
});

describe('FieldControl (file)', () => {
  it('takes the picked file and empties the input, so the same file can be picked again', () => {
    const file = { name: 'rows.xlsx' } as File;
    const input = { files: [file] as unknown as FileList, value: 'C:\\fakepath\\rows.xlsx' };
    expect(takeFile(input)).toBe(file);
    expect(input.value).toBe('');
  });
});
