import { describe, expect, it } from 'vitest';
import { compareCellValues, elements, nodeText, renderTableParts } from '@/components/table/table-model';

describe('universal table controls', () => {
  it('compares grouped amounts, day-first dates and identifiers correctly', () => {
    expect(nodeText(['Remarks', false, <span key="icon" />])).toBe('Remarks');
    expect(compareCellValues('1,200,000.00', '95,000.00')).toBeGreaterThan(0);
    expect(compareCellValues('02-12-2025', '01-01-2026')).toBeLessThan(0);
    expect(compareCellValues('0000000002', '0000000010')).toBeLessThan(0);
    expect(compareCellValues('USD 12,000.00', 'USD 800.00')).toBeGreaterThan(0);
    expect(compareCellValues('(1,200.00)', '200.00')).toBeLessThan(0);
    expect(compareCellValues('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
  });
  it('reorders and hides matching headers/data through React while keeping action handlers', () => {
    const click = () => undefined;
    const nodes = <><thead><tr><th>Code</th><th>Description</th><th>Amount</th></tr></thead><tbody><tr key="a" onClick={click}><td>A</td><td>Long description</td><td>10</td></tr></tbody></>;
    const parts = renderTableParts(nodes, [2, 0], null, head => head);
    const row = elements(parts[1].props.children)[0];
    expect(elements(row.props.children).map(cell => cell.props.children)).toEqual(['10', 'A']);
    expect(row.props.onClick).toBe(click);
  });
  it('keeps summary rows in their groups when sorting rows', () => {
    const nodes = <><thead><tr><th>Amount</th></tr></thead><tbody><tr key="a"><td>10</td></tr><tr key="b"><td>2</td></tr><tr key="total"><td colSpan={2}>Total</td></tr></tbody></>;
    const original = renderTableParts(nodes, [0], null, head => head);
    const rows = elements(original[1].props.children);
    const values = Object.fromEntries(rows.map(row => [String(row.props['data-table-row']), String(elements(row.props.children)[0].props.children)]));
    const sorted = renderTableParts(nodes, [0], { column: 0, descending: false, values }, head => head);
    expect(elements(sorted[1].props.children).map(row => elements(row.props.children)[0].props.children)).toEqual(['2', '10', 'Total']);
  });
});
