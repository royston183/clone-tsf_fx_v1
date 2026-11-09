import { describe, expect, it } from 'vitest';
import { dealFigures, dealTotals, pctText, usdMn, type DealRow } from '@/pages/propose-tradeflows/logic';

const deal = (usd: string | null, assignedUsd: string, status: DealRow['status'] = 'Open'): DealRow => ({ dealId: 'D', usd, assignedUsd, remainingUsd: '', status } as unknown as DealRow);

describe('deal list figures', () => {
  it('shows USD millions with two decimals', () => {
    expect(usdMn('23894000')).toBe('23.89');
    expect(usdMn('1234567890')).toBe('1,234.57');
    expect(usdMn(null)).toBe('—');
  });
  it('total, utilized, balance and remaining %', () => {
    const f = dealFigures(deal('25000000.00', '10000000.00'));
    expect([usdMn(f.total), usdMn(f.utilized), usdMn(f.balance), pctText(f.remainingPct)]).toEqual(['25.00', '10.00', '15.00', '60.00%']);
    expect(f.issue).toBe('');
  });
  it('a deal with nothing assigned is 100% remaining, a filled one 0%', () => {
    expect(pctText(dealFigures(deal('1000000', '0')).remainingPct)).toBe('100.00%');
    expect(pctText(dealFigures(deal('1000000', '1000000', 'Filled')).remainingPct)).toBe('0.00%');
  });
  it('a zero total has no percentage, a missing total is not read as zero', () => {
    const zero = dealFigures(deal('0.00', '0'));
    expect(zero.remainingPct).toBeNull();
    expect(zero.issue).not.toBe('');
    const missing = dealFigures(deal(null, '500'));
    expect(missing.total).toBeNull();
    expect(missing.balance).toBeNull();
    expect(pctText(missing.remainingPct)).toBe('—');
    expect(missing.issue).not.toBe('');
  });
  it('over-utilization is flagged and the balance is not clamped', () => {
    const f = dealFigures(deal('1000000', '1200000'));
    expect(f.balance).toBe('-200000.00');
    expect(f.issue).not.toBe('');
  });
  it('totals leave out a deal without an amount and say so', () => {
    const t = dealTotals([deal('1000000', '250000'), deal(null, '5')]);
    expect([t.total, t.utilized, t.balance]).toEqual(['1000000.00', '250005.00', '750000.00']);
    expect(t.issue).toContain('1 deal');
  });
});
