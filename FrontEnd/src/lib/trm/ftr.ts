// FTR_DISPLAY screen model of a transaction, ported from the SAP Reporting app (src/pages/trm-deal/ftr.js): the header
// block, the tab strip in SAP's order and the group boxes of each tab, derived from the NIIF Transaction set with its
// _Flow. SAP shows a different screen per product category (L-848): money market (550: 26A, 26M, 35B) is "Display
// Interest Rate Instrument"; stock, investment fund and bond (10, 20, 40) are "Display Stock / Investment Fund / Bond";
// convertible bond (70: 26H) is the older "Display Security Transaction" with its own Trading Data tab. Layout, labels
// and number formats follow SAP (FS_DEV3 on DS4/100 NIIF, 2026-10-17 and 2026-10-20); dates are DD-MM-YYYY. Values the
// service does not deliver are left out.
import { date, stripZeros } from './rules';
import type { TrmDeal, TrmFlow, TrmValue } from './types';

export type FtrTabId = 'structure' | 'trading' | 'admin' | 'otherflows' | 'payment' | 'cashflow' | 'status';
export interface FtrTab { id: FtrTabId; label: string; title: string }
export interface FtrLayout { kind: 'moneyMarket' | 'security'; classic?: boolean; name: string; tabs: FtrTab[] }

const TAB: Record<FtrTabId, FtrTab> = {
  structure: { id: 'structure', label: 'Structure', title: 'Structure' },
  trading: { id: 'trading', label: 'Trading Data', title: 'Trading Data' },
  admin: { id: 'admin', label: 'Administr.', title: 'Admin.' },
  otherflows: { id: 'otherflows', label: 'Other Flows', title: 'Other Flows' },
  payment: { id: 'payment', label: 'Payment Details', title: 'Payment Details' },
  cashflow: { id: 'cashflow', label: 'Cash Flow', title: 'Cash Flow' },
  status: { id: 'status', label: 'Status', title: 'Status' }
};
/** SAP's main tabs of a securities transaction, in SAP's order (Memos and Partner Assignment left out on request, 2026-10-17). */
export const TAB_ORDER: FtrTab[] = [TAB.structure, TAB.admin, TAB.otherflows, TAB.payment, TAB.cashflow, TAB.status];
// Money market product types whose SAP tab strip has Other Flows (product type customizing; 26A and 26M have none).
const MONEY_MARKET_OTHER_FLOWS = new Set(['35B']);

/** One plain value of the record (its _Flow is not one). */
const val = (v: TrmValue | TrmFlow[]): TrmValue => (Array.isArray(v) ? undefined : v);
/** The value as text, blank for none (SAP's `value || ''`). */
const str = (v: TrmValue | TrmFlow[]): string => (v && !Array.isArray(v) ? String(v) : '');

/** Which FTR_DISPLAY screen SAP opens for the transaction: kind, the title's object name and the tabs. */
export function layoutOf(d: TrmDeal): FtrLayout {
  if (str(d.FinancialInstrProductCategory) === '550') {
    // Int.Rate.Adj. and FX Rate Adj. are not delivered by the service; Memos and Partner Assignment stay out as for securities.
    return { kind: 'moneyMarket', name: 'Interest Rate Instrument',
      tabs: [TAB.structure, TAB.admin, ...(MONEY_MARKET_OTHER_FLOWS.has(str(d.FinancialInstrumentProductType)) ? [TAB.otherflows] : []), TAB.payment, TAB.cashflow, TAB.status] };
  }
  if (str(d.FinancialInstrProductCategory) === '70') {
    return { kind: 'security', classic: true, name: 'Security Transaction',
      tabs: [TAB.structure, TAB.trading, { ...TAB.admin, label: 'Administration', title: 'Administration' }, TAB.otherflows, TAB.payment, TAB.cashflow, TAB.status] };
  }
  return { kind: 'security', classic: false, name: str(d.FinInstrProductCategoryName) || 'Security Transaction', tabs: TAB_ORDER };
}

// SAP's own grouping (1,000,000.00), not the workspace's lakh grouping: the pop-up is compared figure by figure with FTR_DISPLAY.
const formats: Record<string, Intl.NumberFormat> = {};
const sapNumber = (value: unknown, min: number, max: number): string => (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? ''
  : (formats[`${min}|${max}`] ??= new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max })).format(Number(value)));
export const amount = (value: unknown): string => sapNumber(value, 2, 2);
/** "1,000,000.00-" for an outgoing amount, as SAP's grids show it. */
export const signed = (value: unknown, sign?: unknown): string => { const t = amount(Math.abs(Number(value))); return t && sign === '-' ? `${t}-` : t; };
export const units = (value: unknown): string => sapNumber(value, 0, 3);
/** Unit-quoted price as entered: 100, 61.67101581325. */
export const price = (value: unknown): string => sapNumber(value, 0, 14);
/** Market price from the rate table, SAP's 14 decimals: 100.00000000000000. */
export const marketPrice = (value: unknown): string => sapNumber(value, 14, 14);
export const percent = (value: unknown): string => (Number(value || 0)).toFixed(7);
const time = (value: TrmValue | TrmFlow[]): string => (value && value !== '00:00:00' ? str(value) : '');
const pair = (code: TrmValue | TrmFlow[], name: TrmValue | TrmFlow[]): [string, string] => [str(code), str(name)];
const join = (parts: string[], separator = ' '): string => parts.filter(Boolean).join(separator);

/** Header block of every FTR_DISPLAY securities screen. */
export const headerOf = (d: TrmDeal) => ({
  companyCode: pair(d.CompanyCode, d.CompanyCodeName), transaction: stripZeros(val(d.FinancialTransaction)),
  securityClass: pair(stripZeros(val(d.SecurityClass)), d.SecurityClassName), activity: pair(d.ActiveActivity, d.ActivityCategoryName),
  transactionType: pair(d.FinancialInstrTransactionType, d.TransactionTypeName)
});

/** The partner as SAP prints it beside the number: "AXIS BANK LIMITED / Pandurang Badhkar Marg, Worli / MUMBAI 400025". */
export const partnerOf = (d: TrmDeal) => ({
  number: stripZeros(val(d.Counterparty)),
  text: join([str(d.CounterpartyName), join([str(d.CounterpartyStreet), str(d.CounterpartyHouseNumber)]), join([str(d.CounterpartyCity), str(d.CounterpartyPostalCode)])], ' / ')
});

/** Flows of the active activity: FTR_DISPLAY lists those only, never the flows a later activity replaced. */
export const activeFlowsOf = (d: TrmDeal): TrmFlow[] => (d._Flow ?? []).filter(f => !d.ActiveActivity || String(f.FinancialInstrumentActivity) === String(d.ActiveActivity))
  .sort((a, b) => String(a.FinTransFlowPaymentDate).localeCompare(String(b.FinTransFlowPaymentDate)) || Number(a.FinTransFlowNumber) - Number(b.FinTransFlowNumber));
/** Other Flows tab: additional flows (flow category 90). */
export const otherFlowsOf = (d: TrmDeal): TrmFlow[] => activeFlowsOf(d).filter(f => f.FinTransFlowCategory === '90');

/** Structure tab: Contract Conclusion, Partner, Securities. */
export function structureOf(d: TrmDeal) {
  const flows = activeFlowsOf(d), flow = flows.find(f => f.FinTransFlowCategory === '10') ?? flows[0];
  const priced = Boolean(d.SpotPriceDate);
  return {
    conclusion: { date: val(d.ContractDate), time: time(d.ContractTime), zone: str(d.ContractTimeZone), trader: str(d.Trader), contactPerson: str(d.ContactPerson), externalReference: str(d.ExternalReference) },
    partner: partnerOf(d),
    securities: {
      flowType: flow ? pair(flow.FinTransFlowType, flow.FinTransFlowTypeName) : ['', ''] as [string, string], account: pair(d.SecurityAccount, d.SecurityAccountName), valuationClass: str(d.FinancialInstrValClassName),
      positionDate: val(d.FinTransPositionValueDate), calculationDate: val(d.CalculationDate), paymentDate: val(d.FinTransFlowPaymentDate),
      units: units(d.FinTransTradedNumberOfUnits), price: price(d.FinTransTrdPriceCrcyUnitRate), priceCurrency: str(d.FinTransTradedPriceCrcyUnit),
      marketPrice: priced ? marketPrice(d.SpotPrice) : '', marketPriceCurrency: priced ? str(d.SpotPriceCurrency) : '',
      marketValue: amount(d.MarketValue), marketValueCurrency: str(d.QuotationCurrency) || str(d.PaymentCurrency), origin: priced ? `Rate Table ${date(val(d.SpotPriceDate))}` : '',
      paymentAmount: amount(d.PaymentAmount), paymentCurrency: str(d.PaymentCurrency), exchange: str(d.SecurityExchange)
    }
  };
}

/** Administration tab: Position Assignment and Assignment. */
export const adminOf = (d: TrmDeal) => ({
  portfolio: pair(d.Portfolio, d.PortfolioName), valuationClass: str(d.FinancialInstrValClassName), assignment: str(d.FinancialInstrumentAssignment),
  reference: str(d.FinancialInstrumentReference), characteristic: str(d.FinancialInstrCharacteristic), businessPlace: str(d.BusinessPlace), authorizationGroup: str(d.FinTransAuthorizationGroup)
});

/** SAP's "Post.Stat." column: the posting block reason when one blocks the flow (3 "Activity does not allow posting"), else the status text. */
export const postingText = (f: TrmFlow): string => (Number(f.FinTransFlowPostingBlkgReason) ? str(f.FinTransFlowPostingBlkgRsnName) : str(f.FinTransFlowPostingStatusName));
const signedValue = (f: TrmFlow) => (f.FinTransFlowPaytAmtDirection === '-' ? -1 : 1) * (Number(f.FinTransFlowPaytAmt) || 0);
/** The total line under the flows: the signed sum per payment currency, "1,000,000.00-". */
export function flowTotals(rows: TrmFlow[]): { currency: string; text: string }[] {
  const by = new Map<string, number>();
  for (const f of rows) { const c = str(f.FinTransFlowPaytAmtCrcy); by.set(c, Math.round(((by.get(c) ?? 0) + signedValue(f)) * 100) / 100); }
  return [...by].map(([currency, total]) => ({ currency, text: signed(total, total < 0 ? '-' : '') }));
}

/** Status tab: Correspondence, Activity, Transaction. A zero previous activity and an unchanged deal are blank in SAP. */
export const statusOf = (d: TrmDeal) => ({
  confirmation: pair(d.ConfirmationStatus, d.ConfirmationStatusName), counterconfirmation: pair(d.CounterconfirmationStatus, d.CounterconfirmationStatusName),
  activityCategory: pair(d.ActivityCategory, d.ActivityCategoryName), activityStatus: pair(d.ActivityStatus, d.ActivityStatusName),
  previousActivity: Number(val(d.PreviousActivity)) ? String(Number(val(d.PreviousActivity))) : '',
  entered: [str(d.ActivityEnteredBy), date(val(d.ActivityEnteredOn)), time(d.ActivityEnteredAt), str(d.ActivityFunctionName)],
  processingCategory: pair(d.FinTransProcessingCategory, d.FinTransProcessingCategoryName), status: pair(d.FinancialInstrumentStatus, d.FinancialInstrumentStatusName),
  activeActivity: str(d.ActiveActivity), releaseStatus: pair(d.FinTransReleaseStatus, d.FinTransReleaseStatusName),
  created: [str(d.CreatedByUser), date(val(d.FinTransCreationDate)), time(d.FinTransCreationTime)],
  changed: d.LastChangedByUser ? [str(d.LastChangedByUser), date(val(d.LastChangeDate)), time(d.FinInstrumentLastChangedTime)] : ['', '', '']
});

// Money market (Interest Rate Instrument) screen. The list-box texts are the ones FTR_DISPLAY shows on NIIF for each stored code
// (read off the screens, 2026-10-20, L-848); a code without a known text is shown as stored.
const INCLUSIVE: Record<string, string> = { '': 'Start Included', X: 'End Included', Y: 'Start and End Included', Z: 'Start and End Excluded' };
const ROUNDING: Record<string, string> = { '': 'Round to the Nearest', '-': 'Round Down', '+': 'Round Up', H: 'Round Down If 5' };
const FREQUENCY_UNITS: Record<string, string> = { 0: 'Months', 1: 'Days', 2: 'Weeks', 4: 'Years' };
// Interest calculation methods: SAP domain SZBMETH.
const CALCULATION_METHODS: Record<string, string> = {
  1: '360E/360', B: '360E/365', L: '360/360 (German)', F: '360/360 (ISDA)', H: '360/365 (ISDA)', 7: '360/360', 2: 'act/360', E: 'act/364',
  3: 'act/365', R: 'act/365.25', 4: 'act/366', M: 'act/365P', 5: 'act/actP (ICMA)', 6: 'act/actY (ISDA)', G: 'act/actE (AFB)', Q: 'act/actEP (AFB)',
  N: 'act/365L', S: 'act/365Y', A: 'actW/252', D: '365/360', C: '365/365', I: '360E/actY', 8: '30,42E/360', 9: '*365.25/360', P: '1/1',
  J: 'm+act/360', K: 'm+30/360', T: 'act/act[M]', U: 'actW/actW[M]'
};
const textOf = (texts: Record<string, string>, code: TrmValue | TrmFlow[]): string => { const c = String(val(code) ?? ''); return texts[c] ?? c; };
/** "2026-07-14" plus whole months, the day kept or cut to the month's last day. */
function addMonths(iso: string, months: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!match) return '';
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + months, year = Math.floor(index / 12), month = index % 12 + 1;
  const day = Math.min(Number(match[3]), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface FtrFrequency { label: string; manual: boolean; every: [string, string] | null; validFrom?: TrmValue; dueDate?: string; calculationDate?: TrmValue }
/** SAP's Frequency list box: At End of Term; for a 1-month rhythm On Last Day of Month, Monthly (first due date one month after
 *  the start) or On First Day of Month; anything else is Manual Input, which also shows the item's dates. */
export function frequencyOf(d: TrmDeal): FtrFrequency {
  const count = Number(val(d.InterestFrequency)) || 0, unit = String(val(d.InterestFrequencyUnit) ?? '0');
  if (!count) return { label: 'At End of Term', manual: false, every: null };
  const every: [string, string] = [String(count), textOf(FREQUENCY_UNITS, unit)], dueDate = str(d.InterestDueDate);
  if (count === 1 && unit === '0') {
    if (d.InterestDueMonthEnd === 'X') return { label: 'On Last Day of Month', manual: false, every };
    if (dueDate && dueDate === addMonths(str(d.TermStartDate), 1)) return { label: 'Monthly', manual: false, every };
    if (/-01$/.test(dueDate)) return { label: 'On First Day of Month', manual: false, every };
  }
  return { label: 'Manual Input', manual: true, every, validFrom: val(d.InterestValidFrom), dueDate, calculationDate: val(d.InterestCalculationDate) };
}

/** Header block of the Interest Rate Instrument screen: product type instead of the security class. */
export const moneyMarketHeaderOf = (d: TrmDeal) => ({
  companyCode: pair(d.CompanyCode, d.CompanyCodeName), transaction: stripZeros(val(d.FinancialTransaction)),
  productType: pair(d.FinancialInstrumentProductType, d.ProductTypeName), activity: pair(d.ActiveActivity, d.ActivityCategoryName),
  transactionType: pair(d.FinancialInstrTransactionType, d.TransactionTypeName)
});

/** Structure tab of the Interest Rate Instrument: Invest, Term, Interest Structure, Repayment Structure, Contract Conclusion. */
export function moneyMarketOf(d: TrmDeal) {
  // The invested amount is the first flow of the active activity (1100 Loan Given: Disbursement on NIIF).
  const flow = activeFlowsOf(d)[0] as TrmFlow | undefined;
  const interestCategory = d.InterestCategory === '0' || d.InterestCategory === '2' ? 'Fixed' : str(d.InterestCategoryName) || str(d.InterestCategory);
  const repayment = str(d.RepaymentConditionTypeName);
  return {
    partner: partnerOf(d),
    invest: {
      flowType: flow ? pair(flow.FinTransFlowType, flow.FinTransFlowTypeName) : ['', ''] as [string, string],
      amount: flow ? amount(flow.FinTransFlowPaytAmt) : '', direction: str(flow?.FinTransFlowPaytAmtDirection), currency: str(flow?.FinTransFlowPaytAmtCrcy),
      rounding: textOf(ROUNDING, d.FinTransRoundingCategory)
    },
    term: { start: val(d.TermStartDate), end: val(d.TermEndDate), inclusive: textOf(INCLUSIVE, d.TermInclusiveCode), category: d.TermEndDate ? 'Fixed Term' : '' },
    interest: d.InterestConditionType ? {
      category: interestCategory, rate: percent(val(d.InterestRate)), method: textOf(CALCULATION_METHODS, d.InterestCalculationMethod), frequency: frequencyOf(d),
      conditionType: pair(d.InterestConditionType, d.InterestConditionTypeName), conditionGroup: str(d.InterestConditionGroup)
    } : null,
    repayment: d.RepaymentConditionType ? {
      method: /final/i.test(repayment) ? 'Final Repayment' : repayment, conditionType: pair(d.RepaymentConditionType, repayment)
    } : null,
    conclusion: { date: val(d.ContractDate), time: time(d.ContractTime), zone: str(d.ContractTimeZone), contactPerson: str(d.ContactPerson), mic: str(d.MarketIdentifierCode),
      trader: str(d.Trader), externalReference: str(d.ExternalReference) }
  };
}

/** Administr. tab of the Interest Rate Instrument: Position Assignment, Additional Fields, Authorization. */
export const moneyMarketAdminOf = (d: TrmDeal) => ({
  facility: str(d.TreasuryFacility), portfolio: pair(d.Portfolio, d.PortfolioName), guarantor: stripZeros(val(d.FinancialInstrumentGuarantor)), financeProject: str(d.TreasuryFinanceProject),
  valuationClass: str(d.FinancialInstrValClassName), assignment: str(d.FinancialInstrumentAssignment), reference: str(d.FinancialInstrumentReference),
  characteristic: str(d.FinancialInstrCharacteristic), cfiCode: str(d.ClassificationOfFinInstr), productId: str(d.UniqueProductIdentifier),
  reportTrackingNumber: str(d.ReportTrackingNumber), businessPlace: str(d.BusinessPlace), authorizationGroup: str(d.FinTransAuthorizationGroup)
});

/** Status tab of the Interest Rate Instrument: the activity shows who last changed it instead of the previous activity. */
export const moneyMarketStatusOf = (d: TrmDeal) => ({
  ...statusOf(d),
  activityChanged: d.ActivityChangedBy ? [str(d.ActivityChangedBy), date(val(d.ActivityChangedOn)), time(d.ActivityChangedAt)] : ['', '', '']
});
