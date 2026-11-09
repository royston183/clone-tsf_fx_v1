// src/components/gallery/samples.ts
// Built-in sample data for the Gallery. Nothing here comes from SAP.
import type { AnyField } from '@/lib/fields';
import type { LookupItem, Option, Row } from '@/lib/grid/types';

export const CURRENCIES: LookupItem[] = [
  { CODE: 'INR', TEXT: 'Indian Rupee' }, { CODE: 'USD', TEXT: 'US Dollar' }, { CODE: 'EUR', TEXT: 'Euro' },
  { CODE: 'GBP', TEXT: 'British Pound' }, { CODE: 'JPY', TEXT: 'Japanese Yen' }, { CODE: 'SGD', TEXT: 'Singapore Dollar' }
];
const TYPES: Option[] = [{ value: '01', label: '01 Loan' }, { value: '02', label: '02 Deposit' }, { value: '03', label: '03 Bond' }];
const UNITS: Option[] = [{ value: '1', label: 'Absolute' }, { value: '1e3', label: 'Thousands' }, { value: '1e5', label: 'Lakhs' }, { value: '1e7', label: 'Crores' }];

export interface FieldSample { id: string; note: string; def: AnyField; filled: Row; invalid: Row; error: string }

export const FIELD_SAMPLES: FieldSample[] = [
  { id: 'F-text', note: 'Free text up to the SAP length.', def: { field: 'v', label: 'Description', type: 'text', max: 40 }, filled: { v: 'Term loan to ABC Ltd' }, invalid: { v: '' }, error: 'Description is required.' },
  { id: 'F-code', note: 'Upper case, monospaced; shown with its description in tables.', def: { field: 'v', label: 'Company Code', type: 'code', max: 4 }, filled: { v: '1000' }, invalid: { v: 'X' }, error: "Company Code 'X' does not exist." },
  { id: 'F-integer', note: 'Digits only; NUMC fields keep leading zeros.', def: { field: 'v', label: 'Days', type: 'integer', max: 5 }, filled: { v: '365' }, invalid: { v: '3.5' }, error: 'Days must be a whole number.' },
  { id: 'F-amount', note: 'Type 1L, 2Cr, 500K, 1M or 1B; Enter or blur expands the full amount. Right-aligned with thousands commas; currency is its own field.', def: { field: 'v', label: 'Amount', type: 'amount', currencyField: 'cur' }, filled: { v: '1234567.50' }, invalid: { v: '12.345' }, error: 'Amount must be an amount with at most 2 decimals, e.g. 1234.50.' },
  { id: 'F-decimal', note: 'Rates with their own precision.', def: { field: 'v', label: 'Interest Rate %', type: 'decimal', scale: 4 }, filled: { v: '7.2500' }, invalid: { v: 'abc' }, error: 'Interest Rate % must be an amount with at most 4 decimals, e.g. 1234.50.' },
  { id: 'F-date', note: 'Date picker; tables show DD-MM-YYYY.', def: { field: 'v', label: 'Value Date', type: 'date' }, filled: { v: '2026-04-01' }, invalid: { v: '' }, error: 'Value Date is required.' },
  { id: 'F-dateRange', note: 'From / To; To must not be before From.', def: { field: 'v', label: 'Validity', type: 'dateRange', toField: 'to' }, filled: { v: '2026-04-01', to: '2027-03-31' }, invalid: { v: '2026-04-01', to: '2026-03-01' }, error: 'Validity: the end date must not be before the start date.' },
  { id: 'F-period', note: "ALM's period bar: month and year.", def: { field: 'v', label: 'Period', type: 'period', yearField: 'y' }, filled: { v: '04', y: '2026' }, invalid: { v: '', y: '2026' }, error: 'Period is required.' },
  { id: 'F-select', note: 'Fixed SAP domain values, code and text.', def: { field: 'v', label: 'Product Type', type: 'select', options: TYPES }, filled: { v: '02' }, invalid: { v: '' }, error: 'Product Type is required.' },
  { id: 'F-suggest', note: 'Type to search; F4 opens the value help.', def: { field: 'v', label: 'Currency', type: 'suggest', lookup: () => CURRENCIES, valueHelp: true, max: 3 }, filled: { v: 'INR' }, invalid: { v: 'XXX' }, error: "Currency 'XXX' is not in the list." },
  { id: 'F-multiSelect', note: 'Several values from a list.', def: { field: 'v', label: 'Product Types', type: 'multiSelect', options: TYPES }, filled: { v: '01,03' }, invalid: { v: '' }, error: 'Choose at least one product type.' },
  { id: 'F-flag', note: 'Yes / No, sent to SAP as X or blank.', def: { field: 'v', label: 'Blocked', type: 'flag' }, filled: { v: 'X' }, invalid: { v: '' }, error: 'Confirm the block.' },
  { id: 'F-toggle', note: 'On / Off switch for settings.', def: { field: 'v', label: 'Manual groups only', type: 'toggle' }, filled: { v: 'X' }, invalid: { v: '' }, error: '' },
  { id: 'F-segmented', note: '2 to 4 choices, one click.', def: { field: 'v', label: 'Amounts in', type: 'segmented', options: UNITS }, filled: { v: '1e5' }, invalid: { v: '' }, error: 'Choose a unit.' },
  { id: 'F-textarea', note: 'Long text with a character counter.', def: { field: 'v', label: 'Remarks', type: 'textarea', max: 255 }, filled: { v: 'Approved by the ALCO on 01-04-2026.' }, invalid: { v: '' }, error: 'Remarks are required.' },
  { id: 'F-file', note: 'Drop zone or browse; type and size checked before upload.', def: { field: 'v', label: 'Upload File', type: 'file', accept: ['.xlsx', '.csv'], maxBytes: 5 * 1048576 }, filled: { v: 'budget-2026.xlsx' }, invalid: { v: 'notes.pdf' }, error: 'Upload File must be a .xlsx or .csv file.' },
  { id: 'F-display', note: 'Read-only value, SAP display-field look.', def: { field: 'v', label: 'Outstanding', type: 'display', computed: () => '1,234,567.50' }, filled: {}, invalid: {}, error: '' }
];

export const DEAL_FIELDS: AnyField[] = [
  { field: 'deal', label: 'Deal *', type: 'code', max: 10, required: true },
  { field: 'type', label: 'Product Type *', type: 'select', options: TYPES, required: true },
  { field: 'currency', label: 'Currency *', type: 'suggest', lookup: () => CURRENCIES, valueHelp: true, max: 3, required: true },
  { field: 'amount', label: 'Amount *', type: 'amount', currencyField: 'currency', required: true },
  { field: 'from', label: 'Validity *', type: 'dateRange', toField: 'to', required: true },
  { field: 'remarks', label: 'Remarks', type: 'textarea', max: 255 }
];
export const DEAL: Row = { deal: 'TL-1001', type: '01', amount: '2500000.00', currency: 'INR', from: '2026-04-01', to: '2031-03-31', remarks: '' };
