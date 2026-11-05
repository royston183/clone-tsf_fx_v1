// tests/support/trm-records.ts
// Synthetic records for tests only, shaped like the Transaction set of ZFS_SB_TRMPOSVAL26E_O4_API (NIIF), taken from the
// SAP Reporting app's own fixtures (tests/fixtures/transaction.mjs); never used as application data.
import type { TrmDeal, TrmFlow } from '@/lib/trm/types';

export const transactionRecord: TrmDeal = {
  CompanyCode: '1000', FinancialTransaction: '0000001900004', CompanyCodeName: 'Test company',
  SecurityClass: '0000000400013', SecurityClassName: 'TEST SEC', SecurityClassDescription: 'Synthetic test security', Isin: 'IN0000000001',
  SecurityAccount: 'TEST-01', SecurityAccountName: 'Test account', FinancialInstrumentProductType: '26E', ProductTypeName: 'Inv: Equity',
  FinancialInstrTransactionType: '100', TransactionTypeName: 'Investment', FinancialInstrumentStatus: '0', FinancialInstrumentStatusName: 'Active',
  Counterparty: '0000000123', CounterpartyName: 'Example Business Partner', Portfolio: 'TEST', TreasuryValuationClass: '3',
  TermStartDate: '2026-04-01', FinTransCreationDate: '2026-04-01', CreatedByUser: 'TEST',
  FinTransPositionValueDate: '2026-04-01', CalculationDate: '2026-04-01', FinTransFlowPaymentDate: '2026-04-02',
  FinTransTradedNumberOfUnits: 1000, FinTransTrdPriceCrcyUnitRate: 61.5, FinTransTradedPriceCrcyUnit: 'INR', FinTransTradedPricePercent: 0,
  FinTransFlowNomAmtCrcy: 'INR', FinTransTradedNomAmt: 0, PaymentCurrency: 'INR', PaymentAmount: 61500, PositionCurrency: 'INR', PositionAmount: 61500,
  LocalCurrency: 'INR', LocalAmount: 61500,
  FinancialInstrProductCategory: '10', FinInstrProductCategoryName: 'Stock', PortfolioName: 'Test portfolio', FinancialInstrValClassName: 'Test valuation class',
  CounterpartyStreet: 'Test Street', CounterpartyHouseNumber: '1', CounterpartyCity: 'TESTCITY', CounterpartyPostalCode: '100001',
  FinancialInstrumentAssignment: 'ASSIGN-1', FinancialInstrumentReference: '', FinancialInstrCharacteristic: '', BusinessPlace: '', FinTransAuthorizationGroup: '',
  FinTransProcessingCategory: '00002', FinTransProcessingCategoryName: 'Order - Contract - Settlement', FinTransReleaseStatus: '1', FinTransReleaseStatusName: 'Release Not Required',
  FinTransCreationTime: '10:00:00', LastChangedByUser: 'TEST2', LastChangeDate: '2026-04-03', FinInstrumentLastChangedTime: '11:30:00',
  ActiveActivity: '2', ActivityCategory: '30', ActivityCategoryName: 'Settlement', ContractDate: '2026-04-01', ContractTime: '09:15:00', ContractTimeZone: 'UTC+4',
  Trader: '', ContactPerson: '', ExternalReference: '', ConfirmationStatus: '0', ConfirmationStatusName: 'Not Required', CounterconfirmationStatus: '0', CounterconfirmationStatusName: 'Not Required',
  ActivityStatus: '0', ActivityStatusName: 'Active', PreviousActivity: '1', ActivityEnteredBy: 'TEST2', ActivityEnteredOn: '2026-04-03', ActivityEnteredAt: '11:30:00',
  ActivityFunction: '0002', ActivityFunctionName: 'Activity transition', SecurityExchange: '', QuotationCurrency: 'INR', MarketValue: 61500,
  SpotPrice: 100, SpotPriceCurrency: 'INR', SpotPriceDate: '2026-10-17',
  _Flow: [
    { FinancialInstrumentActivity: '1', FinTransFlowCreationDate: '2026-04-01', FinTransFlowCreationTime: '10:00:00', FinTransFlowNumber: '1', FinTransFlowPaymentDate: '2026-04-02', FinTransFlowCategory: '10', FinTransFlowType: '0100', FinTransFlowTypeName: 'Purchase (transaction)', FinTransFlowPaytAmtDirection: '-', FinTransFlowPaytAmt: 61500, FinTransFlowPaytAmtCrcy: 'INR', CalculationPeriodStartDate: null, CalculationPeriodEndDate: null, FinTransFlowIntrstRateFixDate: null, AccountingDocument: '', FinTransFlowPostingStatus: '0', FinTransFlowPostingStatusName: 'Blocked for posting', FinTransFlowPostingBlkgReason: '3', FinTransFlowPostingBlkgRsnName: 'Activity does not allow posting', ConditionPercentageRate: 0 },
    { FinancialInstrumentActivity: '2', FinTransFlowCreationDate: '2026-04-03', FinTransFlowCreationTime: '11:30:00', FinTransFlowNumber: '1', FinTransFlowPaymentDate: '2026-04-02', FinTransFlowCategory: '10', FinTransFlowType: '0100', FinTransFlowTypeName: 'Purchase (transaction)', FinTransFlowPaytAmtDirection: '-', FinTransFlowPaytAmt: 61500, FinTransFlowPaytAmtCrcy: 'INR', CalculationPeriodStartDate: null, CalculationPeriodEndDate: null, FinTransFlowIntrstRateFixDate: null, AccountingDocument: '', FinTransFlowPostingStatus: '1', FinTransFlowPostingStatusName: 'Flagged for posting', FinTransFlowPostingBlkgReason: '0', FinTransFlowPostingBlkgRsnName: 'Flow not blocked for posting', ConditionPercentageRate: 0 },
    { FinancialInstrumentActivity: '2', FinTransFlowCreationDate: '2026-04-03', FinTransFlowCreationTime: '11:30:00', FinTransFlowNumber: '2', FinTransFlowPaymentDate: '2026-04-02', FinTransFlowCategory: '90', FinTransFlowType: '9001', FinTransFlowTypeName: 'Test charges', FinTransFlowPaytAmtDirection: '-', FinTransFlowPaytAmt: 25, FinTransFlowPaytAmtCrcy: 'INR', CalculationPeriodStartDate: null, CalculationPeriodEndDate: null, FinTransFlowIntrstRateFixDate: null, AccountingDocument: '', FinTransFlowPostingStatus: '1', FinTransFlowPostingStatusName: 'Flagged for posting', FinTransFlowPostingBlkgReason: '0', FinTransFlowPostingBlkgRsnName: 'Flow not blocked for posting', ConditionPercentageRate: 0 },
  ],
};

// A money market deal (product category 550, Interest Rate Instrument) with the condition fields the FTR_DISPLAY money market screen
// reads; synthetic, shaped like 35B on NIIF (6 % fixed, act/365, final repayment, an Other Flows tab).
const flows = transactionRecord._Flow as TrmFlow[];
export const moneyMarketRecord: TrmDeal = {
  ...transactionRecord,
  CompanyCode: '1000', FinancialTransaction: '0000035000011', SecurityClass: '', SecurityClassName: '', SecurityClassDescription: '', Isin: '', SecurityAccount: '', SecurityAccountName: '',
  PositionTransaction: '0000035000011', FinancialInstrumentProductType: '35B', ProductTypeName: 'Test loan given', FinancialInstrTransactionType: '100', TransactionTypeName: 'Loan Give - Test',
  FinancialInstrProductCategory: '550', FinInstrProductCategoryName: 'Interest Rate Instrument', ActiveActivity: '1', ActivityCategory: '10', ActivityCategoryName: 'Contract',
  ActivityFunctionName: 'New entry', ActivityChangedBy: 'TEST3', ActivityChangedOn: '2026-04-05', ActivityChangedAt: '08:00:00', PreviousActivity: '0',
  TermStartDate: '2025-01-01', TermEndDate: '2027-01-01', TermInclusiveCode: '', FinTransRoundingCategory: '', MarketIdentifierCode: '',
  TreasuryFacility: '', FinancialInstrumentGuarantor: '', TreasuryFinanceProject: '', ClassificationOfFinInstr: '', UniqueProductIdentifier: '', ReportTrackingNumber: '',
  InterestConditionType: '1200', InterestConditionTypeName: 'Nominal interest', InterestCategory: '2', InterestCategoryName: 'Fixed Interest', InterestRate: 6,
  InterestCalculationMethod: '3', InterestFrequency: '0', InterestFrequencyUnit: '0', InterestConditionGroup: '1000', InterestValidFrom: '2025-01-01',
  InterestDueDate: '2027-01-01', InterestCalculationDate: '2027-01-01', InterestDueMonthEnd: '', RepaymentConditionType: '1120', RepaymentConditionTypeName: 'Final repayment',
  FinTransTradedNumberOfUnits: 0, FinTransTrdPriceCrcyUnitRate: 0, MarketValue: 0, PaymentAmount: 0, SpotPrice: null, SpotPriceCurrency: '', SpotPriceDate: null,
  _Flow: [
    { ...flows[1], FinancialInstrumentActivity: '1', FinTransFlowNumber: '1', FinTransFlowPaymentDate: '2025-01-01', FinTransFlowCategory: '00', FinTransFlowType: '1100', FinTransFlowTypeName: 'Loan Given: Disbursement', FinTransFlowPaytAmtDirection: '-', FinTransFlowPaytAmt: 4110000000 },
    { ...flows[1], FinancialInstrumentActivity: '1', FinTransFlowNumber: '2', FinTransFlowPaymentDate: '2027-01-01', FinTransFlowCategory: '20', FinTransFlowType: '1200', FinTransFlowTypeName: 'Nominal interest', FinTransFlowPaytAmtDirection: '+', FinTransFlowPaytAmt: 493200000, CalculationPeriodStartDate: '2025-01-01', CalculationPeriodEndDate: '2027-01-01', ConditionPercentageRate: 6 },
    { ...flows[1], FinancialInstrumentActivity: '1', FinTransFlowNumber: '3', FinTransFlowPaymentDate: '2027-01-01', FinTransFlowCategory: '30', FinTransFlowType: '1120', FinTransFlowTypeName: 'Final Repayment', FinTransFlowPaytAmtDirection: '+', FinTransFlowPaytAmt: 4110000000 },
  ],
};
