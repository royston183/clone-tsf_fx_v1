// Read-only transaction and security-class display from the Transaction set of ZFS_SB_TRMPOSVAL26E_O4_API on NIIF (deals of
// the investment and money market product types), ported from the SAP Reporting app (src/api/trmdeal.js). It runs in the
// browser, through the SAP relay, like every other SAP read of the core.
import { HttpError } from '@/lib/errors';
import { dealKey, MAX_TRANSACTIONS } from '@/lib/trm/rules';
import type { SecurityClassView, TrmDeal } from '@/lib/trm/types';
import { odataString } from '../odata-string';
import { REJECTED_MESSAGE, sapRequest, type SapConnection, type SapService, type SapSettings } from './client';

/** The SAP account, settings and service a read goes through. */
export interface TrmSap { settings: SapSettings; conn: SapConnection; service: SapService }

const COVERED = 'The NIIF service covers product types 26A, 26B, 26C, 26D, 26E, 26H, 26I, 26J, 26K, 26L, 26M, 28B and 35B and leaves out reversed transactions.';

/** A company code, transaction number or class ID as SAP keys it; anything else never reaches SAP. */
function keyOf(value: unknown, name: 'bukrs' | 'deal' | 'class', label: string): string {
  const key = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,13}$/.test(key) || (name === 'bukrs' && key.length > 4)) throw new HttpError(400, `Enter a valid ${label}.`);
  return key;
}

/** GET the Transaction set; SAP errors become errors with SAP's message. */
async function readRows(sap: TrmSap, query: Record<string, string>, what: string): Promise<TrmDeal[]> {
  const result = await sapRequest(sap.settings, sap.conn, sap.service, { path: 'Transaction', query: new URLSearchParams(query).toString() });
  if (result.status === 401) throw new HttpError(502, REJECTED_MESSAGE);
  if (result.status === 403) throw new HttpError(502, 'SAP rejected access. Check the configured SAP account and service authorizations.');
  if (result.status >= 400) {
    let message = '';
    try {
      const error = (JSON.parse(result.text) as { error?: { message?: unknown } }).error?.message;
      message = typeof error === 'string' ? error : typeof (error as { value?: unknown })?.value === 'string' ? (error as { value: string }).value : '';
    } catch { /* not JSON: the status says it */ }
    throw new HttpError(502, message || `SAP returned ${result.status} while reading ${what}.`);
  }
  let data: { value?: unknown };
  try { data = JSON.parse(result.text) as { value?: unknown }; } catch { throw new HttpError(502, 'SAP did not return a valid OData response.'); }
  if (!Array.isArray(data?.value)) throw new HttpError(502, `SAP did not return ${what}. Check the configured service.`);
  return data.value as TrmDeal[];
}

/** SAP stores numbers zero-padded to 13 places; users type them without the zeros: the first form SAP knows wins. */
async function firstFound(values: string[], load: (value: string) => Promise<TrmDeal[]>): Promise<TrmDeal[]> {
  for (const value of new Set(values)) { const rows = await load(value); if (rows.length) return rows; }
  return [];
}

/** One transaction with its flows (`_Flow`, the Cash Flow and Other Flows tabs). */
export async function readTransaction(sap: TrmSap, input: { bukrs: string; deal: string }): Promise<TrmDeal> {
  const companyCode = keyOf(input.bukrs, 'bukrs', 'company code'), number = keyOf(input.deal, 'deal', 'transaction number');
  const [record] = await firstFound([number, dealKey(number)], value =>
    readRows(sap, { $filter: `CompanyCode eq ${odataString(companyCode)} and FinancialTransaction eq ${odataString(value)}`, $expand: '_Flow' }, 'transaction details'));
  if (!record) throw new HttpError(404, `Transaction ${number} in company code ${companyCode} was not found, or you are not authorised to display it. ${COVERED}`);
  return record;
}

/** A security class and its transactions in the company code (newest position value date first, at most 500). */
export async function readSecurityClass(sap: TrmSap, input: { bukrs: string; securityClass: string }): Promise<SecurityClassView> {
  const companyCode = keyOf(input.bukrs, 'bukrs', 'company code'), identifier = keyOf(input.securityClass, 'class', 'security class ID');
  const transactions = await firstFound([identifier, dealKey(identifier)], value =>
    readRows(sap, { $filter: `CompanyCode eq ${odataString(companyCode)} and SecurityClass eq ${odataString(value)}`, $orderby: 'FinTransPositionValueDate desc', $top: String(MAX_TRANSACTIONS) }, 'transaction details'));
  if (!transactions.length) throw new HttpError(404, `No transactions of security class ${identifier} in company code ${companyCode}, or you are not authorised to display them. ${COVERED}`);
  const first = transactions[0];
  return {
    securityClass: { SecurityClass: first.SecurityClass, SecurityClassName: first.SecurityClassName, SecurityClassDescription: first.SecurityClassDescription, Isin: first.Isin,
      FinancialInstrumentProductType: first.FinancialInstrumentProductType, ProductTypeName: first.ProductTypeName },
    transactions
  };
}
