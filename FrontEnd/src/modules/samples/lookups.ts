// Code lists of the Gallery samples (sample data only; nothing here comes from SAP).
import type { LookupItem, Option } from '@/lib/grid/types';

export const CURRENCIES: LookupItem[] = [
  { CODE: 'INR', TEXT: 'Indian Rupee' }, { CODE: 'USD', TEXT: 'US Dollar' }, { CODE: 'EUR', TEXT: 'Euro' }, { CODE: 'GBP', TEXT: 'British Pound' }
];
export const COUNTERPARTIES: LookupItem[] = [
  { CODE: 'CP001', TEXT: 'Axis Finance' }, { CODE: 'CP002', TEXT: "O'Brien Capital" }, { CODE: 'CP003', TEXT: 'Bharat Steel' },
  { CODE: 'CP004', TEXT: 'Coastal Power' }, { CODE: 'CP005', TEXT: 'Deccan Textiles' }, { CODE: 'CP006', TEXT: 'Eastern Rail Fund' },
  { CODE: 'CP007', TEXT: 'Fortune Housing' }, { CODE: 'CP008', TEXT: 'Ganga Logistics' }
];
export const COMPANIES: LookupItem[] = [{ CODE: '1000', TEXT: 'Demo India Ltd' }, { CODE: '2000', TEXT: 'Demo Treasury Ltd' }];
export const GL_ACCOUNTS: LookupItem[] = [
  { CODE: '400100', TEXT: 'Interest Income' }, { CODE: '400200', TEXT: 'Fee Income' }, { CODE: '500100', TEXT: 'Interest Expense' },
  { CODE: '500200', TEXT: 'Staff Cost' }, { CODE: '500300', TEXT: 'Rent' }, { CODE: '600100', TEXT: 'Depreciation' }
];
export const PRODUCTS: Option[] = [{ value: '51A', label: '51A Term Loan' }, { value: '52A', label: '52A Fixed Deposit' }, { value: '53A', label: '53A Bond' }];
