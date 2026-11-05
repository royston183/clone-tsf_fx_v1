// The FTR_DISPLAY screen model, ported from the SAP Reporting app: its own tests (tests/transactions.test.mjs) on its
// own synthetic records, so the template's pop-up shows exactly what Reporting shows.
import { describe, expect, it } from 'vitest';
import {
  activeFlowsOf, adminOf, flowTotals, frequencyOf, headerOf, layoutOf, marketPrice, moneyMarketAdminOf, moneyMarketHeaderOf, moneyMarketOf,
  moneyMarketStatusOf, otherFlowsOf, postingText, price, signed, statusOf, structureOf, units
} from '@/lib/trm/ftr';
import { codeName, date, dealKey, hotspotOf, money, rate, sapDate, stripZeros, transactionTargetOf } from '@/lib/trm/rules';
import type { TrmFlow } from '@/lib/trm/types';
import { moneyMarketRecord, transactionRecord } from '../support/trm-records';

const flowsOf = (d: typeof transactionRecord) => d._Flow as TrmFlow[];

describe('FTR_DISPLAY model (ported from SAP Reporting)', () => {
  it('header, partner line, securities box and status as SAP shows them', () => {
    const d = transactionRecord;
    expect(headerOf(d)).toEqual({ companyCode: ['1000', 'Test company'], transaction: '1900004', securityClass: ['400013', 'TEST SEC'], activity: ['2', 'Settlement'], transactionType: ['100', 'Investment'] });
    const { conclusion, partner, securities: s } = structureOf(d);
    expect(conclusion).toEqual({ date: '2026-04-01', time: '09:15:00', zone: 'UTC+4', trader: '', contactPerson: '', externalReference: '' });
    expect(partner).toEqual({ number: '123', text: 'Example Business Partner / Test Street 1 / TESTCITY 100001' });
    expect(s.flowType).toEqual(['0100', 'Purchase (transaction)']);
    expect(s.units).toBe('1,000');
    expect(s.price).toBe('61.5');
    expect(s.marketPrice).toBe('100.00000000000000');
    expect(s.origin).toBe('Rate Table 17-10-2026');
    expect(s.marketValue).toBe('61,500.00');
    expect(structureOf({ ...d, SpotPriceDate: null }).securities.marketPrice, 'no rate-table price, no Mkt Price or Origin').toBe('');
    expect(adminOf(d).portfolio).toEqual(['TEST', 'Test portfolio']);
    const status = statusOf(d);
    expect(status.previousActivity).toBe('1');
    expect(status.entered).toEqual(['TEST2', '03-04-2026', '11:30:00', 'Activity transition']);
    expect(status.created).toEqual(['TEST', '01-04-2026', '10:00:00']);
    expect(statusOf({ ...d, PreviousActivity: '0', LastChangedByUser: '', LastChangeDate: null }).changed).toEqual(['', '', '']);
    expect(statusOf({ ...d, PreviousActivity: '0' }).previousActivity).toBe('');
  });

  it('opens the screen of the product category: money market, stock / fund / bond, convertible bond', () => {
    const tabs = (d: typeof transactionRecord) => layoutOf(d).tabs.map(tab => tab.label);
    expect([layoutOf(transactionRecord).kind, layoutOf(transactionRecord).name]).toEqual(['security', 'Stock']);
    expect(tabs(transactionRecord)).toEqual(['Structure', 'Administr.', 'Other Flows', 'Payment Details', 'Cash Flow', 'Status']);
    expect(layoutOf({ ...transactionRecord, FinancialInstrProductCategory: '40', FinInstrProductCategoryName: 'Bond' }).name).toBe('Bond');
    const convertible = layoutOf({ ...transactionRecord, FinancialInstrProductCategory: '70', FinInstrProductCategoryName: 'Convertible Bond' });
    expect([convertible.name, convertible.classic]).toEqual(['Security Transaction', true]);
    expect(convertible.tabs.map(tab => tab.label)).toEqual(['Structure', 'Trading Data', 'Administration', 'Other Flows', 'Payment Details', 'Cash Flow', 'Status']);
    expect([layoutOf(moneyMarketRecord).kind, layoutOf(moneyMarketRecord).name]).toEqual(['moneyMarket', 'Interest Rate Instrument']);
    expect(tabs(moneyMarketRecord), '35B has Other Flows in SAP').toEqual(['Structure', 'Administr.', 'Other Flows', 'Payment Details', 'Cash Flow', 'Status']);
    expect(tabs({ ...moneyMarketRecord, FinancialInstrumentProductType: '26A' }), '26A and 26M do not').toEqual(['Structure', 'Administr.', 'Payment Details', 'Cash Flow', 'Status']);
  });

  it('money market Structure, Administr. and Status as the Interest Rate Instrument screen shows them', () => {
    const d = moneyMarketRecord;
    expect(moneyMarketHeaderOf(d)).toEqual({ companyCode: ['1000', 'Test company'], transaction: '35000011', productType: ['35B', 'Test loan given'], activity: ['1', 'Contract'], transactionType: ['100', 'Loan Give - Test'] });
    const m = moneyMarketOf(d);
    expect(m.invest).toEqual({ flowType: ['1100', 'Loan Given: Disbursement'], amount: '4,110,000,000.00', direction: '-', currency: 'INR', rounding: 'Round to the Nearest' });
    expect(m.term).toEqual({ start: '2025-01-01', end: '2027-01-01', inclusive: 'Start Included', category: 'Fixed Term' });
    expect({ ...m.interest, frequency: m.interest?.frequency.label }).toEqual({ category: 'Fixed', rate: '6.0000000', method: 'act/365', frequency: 'At End of Term', conditionType: ['1200', 'Nominal interest'], conditionGroup: '1000' });
    expect(m.repayment).toEqual({ method: 'Final Repayment', conditionType: ['1120', 'Final repayment'] });
    expect(m.conclusion.mic).toBe('');
    const term = (code: string) => moneyMarketOf({ ...d, TermInclusiveCode: code }).term.inclusive;
    const rounding = (code: string) => moneyMarketOf({ ...d, FinTransRoundingCategory: code }).invest.rounding;
    expect(['X', 'Y', 'Z'].map(term)).toEqual(['End Included', 'Start and End Included', 'Start and End Excluded']);
    expect(['-', '+', 'H'].map(rounding)).toEqual(['Round Down', 'Round Up', 'Round Down If 5']);
    expect(moneyMarketOf({ ...d, InterestCalculationMethod: '2' }).interest?.method).toBe('act/360');
    expect(moneyMarketOf({ ...d, InterestCategory: '0', InterestCategoryName: '' }).interest?.category).toBe('Fixed');
    expect(moneyMarketOf({ ...d, InterestConditionType: '' }).interest, 'no interest condition, no Interest Structure box').toBeNull();
    expect(moneyMarketAdminOf(d).portfolio).toEqual(['TEST', 'Test portfolio']);
    expect(moneyMarketStatusOf(d).activityChanged).toEqual(['TEST3', '05-04-2026', '08:00:00']);
  });

  it('names the money market Frequency only for a 1-month rhythm, otherwise Manual Input with the item dates', () => {
    const f = (overrides: Record<string, string>) => frequencyOf({ ...moneyMarketRecord, ...overrides });
    expect(f({})).toEqual({ label: 'At End of Term', manual: false, every: null });
    const month = { InterestFrequency: '1', InterestFrequencyUnit: '0', TermStartDate: '2026-07-08' };
    expect(f({ ...month, InterestDueDate: '2026-08-08' })).toEqual({ label: 'Monthly', manual: false, every: ['1', 'Months'] });
    expect(f({ ...month, InterestDueDate: '2026-07-31', InterestDueMonthEnd: 'X' }).label).toBe('On Last Day of Month');
    expect(f({ ...month, InterestDueDate: '2026-08-01' }).label).toBe('On First Day of Month');
    expect(f({ ...month, TermStartDate: '2026-01-31', InterestDueDate: '2026-02-28' }).label, 'the day is cut to the month end').toBe('Monthly');
    expect(f({ ...month, InterestDueDate: '2026-08-21', InterestValidFrom: '2026-07-08', InterestCalculationDate: '2026-08-21' }))
      .toEqual({ label: 'Manual Input', manual: true, every: ['1', 'Months'], validFrom: '2026-07-08', dueDate: '2026-08-21', calculationDate: '2026-08-21' });
    expect(f({ InterestFrequency: '3', InterestFrequencyUnit: '0', TermStartDate: '2026-07-14', InterestDueDate: '2026-10-14' }).label, 'a regular 3-month rhythm is Manual Input in SAP').toBe('Manual Input');
    expect(f({ InterestFrequency: '1', InterestFrequencyUnit: '1', TermStartDate: '2026-07-27', InterestDueDate: '2026-08-27' }).every).toEqual(['1', 'Days']);
  });

  it('lists the cash flows of the active activity only, with SAP posting texts, signs and totals', () => {
    const flows = activeFlowsOf(transactionRecord);
    expect(flows.map(f => `${f.FinancialInstrumentActivity}/${f.FinTransFlowNumber}`)).toEqual(['2/1', '2/2']);
    expect(otherFlowsOf(transactionRecord).map(f => f.FinTransFlowType)).toEqual(['9001']);
    expect(postingText(flowsOf(transactionRecord)[0]), 'a block reason wins over the status text').toBe('Activity does not allow posting');
    expect(postingText(flows[0])).toBe('Flagged for posting');
    expect(signed(1000000, '-')).toBe('1,000,000.00-');
    expect(flowTotals(flows)).toEqual([{ currency: 'INR', text: '61,525.00-' }]);
    expect(units(729582599)).toBe('729,582,599');
    expect(price(61.67101581325)).toBe('61.67101581325');
    expect(marketPrice(0.5)).toBe('0.50000000000000');
  });
});

describe('transaction rules (ported from SAP Reporting)', () => {
  it('resolves a transaction or security class with a valid company context', () => {
    expect(hotspotOf({ CompanyCode: '1000', FinancialTransaction: '1900004' })).toEqual({ kind: 'deal', bukrs: '1000', deal: '1900004' });
    expect(hotspotOf({ CompanyCode: '1000', SecurityClass: '0000000400013' })).toEqual({ kind: 'class', bukrs: '1000', securityClass: '0000000400013' });
    expect(hotspotOf({ dealNumber: '1900004' })).toBeNull();
    expect(hotspotOf({ companyCode: '1000', dealNumber: '../invalid' })).toBeNull();
    expect(stripZeros('0000001900004')).toBe('1900004');
  });
  it('formats SAP dates as DD-MM-YYYY, amounts in lakhs and rates', () => {
    expect(date('2026-04-01')).toBe('01-04-2026');
    expect(date('')).toBe('');
    expect(sapDate('2026-02-30')).toBe('—');
    expect(money(61500, 'INR')).toBe('61,500.00 INR');
    expect(money(0, 'INR'), 'a zero amount is blank').toBe('');
    expect(money(12345678.5)).toBe('1,23,45,678.50');
    expect(rate(1000, 3)).toBe('1,000');
    expect(codeName('26E', 'Inv: Equity')).toBe('26E · Inv: Equity');
    expect(dealKey('1900004')).toBe('0000001900004');
    expect(dealKey('ABC')).toBe('ABC');
  });
  it('finds the transaction a column holds: declared, or by the names SAP and the apps use', () => {
    const row = { CompanyCode: '1000', FinancialTransaction: '0000001900004', zbukrs: '2000', zdisburseRfha: '35000011', name: 'x' };
    expect(transactionTargetOf({ field: 'FinancialTransaction' }, row)).toEqual({ kind: 'deal', bukrs: '1000', deal: '0000001900004' });
    expect(transactionTargetOf({ field: 'transactionNo' }, { companyCode: '1000', transactionNo: '35000011' })).toEqual({ kind: 'deal', bukrs: '1000', deal: '35000011' });
    expect(transactionTargetOf({ id: 'dealNumber' }, { companyCode: '1000', dealNumber: '42' })).toEqual({ kind: 'deal', bukrs: '1000', deal: '42' });
    expect(transactionTargetOf({ field: 'zdisburseRfha', transaction: { companyField: 'zbukrs' } }, row)).toEqual({ kind: 'deal', bukrs: '2000', deal: '35000011' });
    expect(transactionTargetOf({ field: 'zdisburseRfha', transaction: { companyField: 'zbukrs', kind: 'class' } }, row)).toEqual({ kind: 'class', bukrs: '2000', securityClass: '35000011' });
    expect(transactionTargetOf({ field: 'name' }, row), 'any other column').toBeNull();
    expect(transactionTargetOf({ field: 'FinancialTransaction' }, { FinancialTransaction: '1900004' }), 'no company code').toBeNull();
    expect(transactionTargetOf({ field: 'transactionNo' }, { companyCode: '1000', transactionNo: '' }), 'no number yet').toBeNull();
    expect(transactionTargetOf({ field: 'transactionNo' }, { companyCode: '1000', transactionNo: 'Set on approval' }), 'not a number').toBeNull();
  });
});
