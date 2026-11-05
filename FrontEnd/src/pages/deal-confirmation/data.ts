// Shapes and constants of TSF MO Deal Confirmation (ZSGTSFR024): FX deals FO released (TrmFxApp status 03, 04, 06).
// The queue itself is read live in live.ts; the writes are in workflow.ts.
import { TSF_COMPANIES, TSF_TRADERS } from '@/modules/tsf-deals/lookups';

export interface ConfDeal {
  key: string; dealId: string; companyCode: string; transaction: string; partner: string; txnType: string; tradeDate: string;
  bs1: 'Buy' | 'Sell'; curr1: string; amount1: number; curr2: string; amount2: number; fixingDate: string; valueDate: string; rate: number;
  status: string; trader: string; group: string; profitCenter: string; businessArea: string; product: string; display: 'FX' | 'Options';
  ndfRate?: number; cashAmount?: number; cashCurr?: string; foRemark: string; moRemark: string; extRef: string; intRef: string; overLimit?: boolean;
}

export const CONF_STATUS: Record<string, string> = {
  '03': 'FO->MO: Unmatched', '04': 'MO->FO: Correction Required', '06': 'FO: Error Correction - Corrected', '07': 'Matched & Released', '59': 'Matched & Released'
};
export const confTone = (s: string): 'green' | 'amber' | 'red' => (s === '04' ? 'red' : s === '07' || s === '59' ? 'green' : 'amber');
/** The text of a status code (a code the page does not name keeps SAP's own wording). */
export const confStatusText = (s: string, sapText = ''): string => CONF_STATUS[s] ?? (sapText || s);

export const CONF_COMPANIES = TSF_COMPANIES.map(c => ({ code: String(c.CODE), text: String(c.TEXT) }));
/** Trader codes with their names, as the selection offers them (the report filters by the code). */
export const CONF_TRADERS = TSF_TRADERS;
export const traderText = (code: string): string => TSF_TRADERS.find(t => t.value === code)?.label ?? code;
