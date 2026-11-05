// TRM transaction numbers render as links to their pop-up wherever a value is shown (StatusValue: lists, report cells,
// object headers, display fields), by name or as declared; every other value stays plain text.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FieldControl } from '@/components/fields/FieldControl';
import { TransactionContext } from '@/components/trm/context';
import { StatusValue } from '@/components/ui/StatusValue';
import type { Column } from '@/lib/grid/types';
import type { ReportColumn } from '@/lib/report/types';

const inWorkspace = (node: ReactNode) => renderToStaticMarkup(<TransactionContext.Provider value={{ open: () => {}, openLookup: () => {} }}>{node}</TransactionContext.Provider>);
const LINK = /<button type="button" class="td-link trm-hotspot">([^<]*)<\/button>/;
const column = (field: string, extra: Partial<Column> = {}): Column => ({ field, label: field, text: r => r[field] ?? '', ...extra });
const cell = (c: Column | ReportColumn, row: Record<string, string>) => inWorkspace(<StatusValue definition={c} row={row}>{row['id' in c ? c.id : c.field]}</StatusValue>);

describe('TRM transaction links', () => {
  it('a FinancialTransaction next to a CompanyCode is a link; the other values are plain', () => {
    const row = { CompanyCode: '1000', FinancialTransaction: '0000001900004', CounterpartyName: 'Example' };
    expect(LINK.exec(cell(column('FinancialTransaction'), row))?.[1]).toBe('0000001900004');
    expect(cell(column('CounterpartyName'), row)).toBe('Example');
  });
  it('finds transactionNo and dealNumber next to companyCode without any definition change', () => {
    expect(cell(column('transactionNo'), { companyCode: '1000', transactionNo: '35000011' })).toMatch(LINK);
    expect(cell(column('dealNumber'), { companyCode: '1000', dealNumber: '42' })).toMatch(LINK);
  });
  it('is plain text without a company code or before the number exists', () => {
    expect(cell(column('FinancialTransaction'), { FinancialTransaction: '1900004' })).toBe('1900004');
    expect(cell(column('transactionNo'), { companyCode: '1000', transactionNo: '' })).toBe('');
  });
  it('follows a declared transaction column in a report, with its own company field', () => {
    const c: ReportColumn = { id: 'zdisburseRfha', label: 'Loan Account', type: 'code', transaction: { companyField: 'zbukrs' } };
    expect(LINK.exec(cell(c, { zbukrs: '2000', zdisburseRfha: '60000001' }))?.[1]).toBe('60000001');
  });
  it('keeps a status tag around the link', () => {
    const html = cell(column('FinancialTransaction', { statusTone: () => 'green' }), { CompanyCode: '1000', FinancialTransaction: '1900004' });
    expect(html).toContain('kit-status green');
    expect(html).toMatch(LINK);
  });
  it('is plain text outside the workspace (no pop-up provider)', () => {
    expect(renderToStaticMarkup(<StatusValue definition={column('FinancialTransaction')} row={{ CompanyCode: '1000', FinancialTransaction: '1900004' }}>1900004</StatusValue>)).toBe('<span>1900004</span>');
  });
  it('a display field of an object shows its transaction as a link', () => {
    const html = inWorkspace(<FieldControl def={{ field: 'transactionNo', label: 'TRM Deal', type: 'display' }} variant="form" row={{ companyCode: '1000', transactionNo: '35000011' }} lk={{}} onChange={() => {}} />);
    expect(html).toContain('TRM Deal');
    expect(LINK.exec(html)?.[1]).toBe('35000011');
  });
});
