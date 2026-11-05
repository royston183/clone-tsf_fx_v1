// Sample masters of the TSF FX screens (UI approval only: nothing here is read from SAP or the middleware).
// Codes and texts follow the fixtures and legacy pages of the TSF - FX Application reference project.

export interface Code { code: string; text: string }

export const COMPANIES: (Code & { currency: string; entity: string; profitCenter: string; businessArea: string })[] = [
  { code: 'SG03', text: 'Olam Global Agri Pte. Ltd.', currency: 'USD', entity: 'OGA', profitCenter: 'SG032003', businessArea: 'SG03' },
  { code: 'AE13', text: 'Olam Global Agri DMCC', currency: 'USD', entity: 'DMCC', profitCenter: 'AE132003', businessArea: 'AE13' },
  { code: 'AE11', text: 'Olam Agri Middle East', currency: 'AED', entity: 'OAME', profitCenter: 'AE112003', businessArea: 'AE11' },
  { code: 'IN11', text: 'Olam Agri India Pvt Ltd', currency: 'INR', entity: 'OSIPL', profitCenter: 'IN112003', businessArea: 'IN11' }
];
export const companyText = (code: string) => COMPANIES.find(c => c.code === code)?.text ?? code;

export const BANKS: Code[] = [
  { code: '0660000645', text: 'DBS BANK LTD' },
  { code: '0660000806', text: 'CITIBANK N.A.' },
  { code: '0001000124', text: 'HSBC' },
  { code: '0660000712', text: 'STANDARD CHARTERED BANK' },
  { code: '0660000733', text: 'EMIRATES NBD' },
  { code: '0400000002', text: 'DEUTSCHE BANK AG' }
];
export const bankText = (code: string) => BANKS.find(b => b.code === code)?.text ?? code;

export const GROUPS: (Code & { traders: Code[] })[] = [
  { code: 'G02', text: 'TSF - India', traders: [{ code: 'C27', text: 'Akshay Mohnot (Team Lead)' }, { code: 'NID', text: 'Nidhi S' }] },
  { code: 'G03', text: 'TSF - SEA', traders: [{ code: 'C31', text: 'Wei Ling Tan (Team Lead)' }, { code: 'C34', text: 'Arjun Rao' }] },
  { code: 'G04', text: 'TSF - MEA', traders: [{ code: 'C41', text: 'Omar Haddad (Team Lead)' }] },
  { code: 'G07', text: 'TSF - Brazil', traders: [{ code: 'C52', text: 'Lucas Ferreira (Team Lead)' }] }
];
export const TRADERS: Code[] = GROUPS.flatMap(g => g.traders.map(t => ({ code: t.code, text: t.text.replace(' (Team Lead)', '') })));
export const traderText = (code: string) => TRADERS.find(t => t.code === code)?.text ?? code;

export interface TxnType { key: string; label: string; product: string; type: string; offset: number; ndf?: boolean }
export const TXN_TYPES: TxnType[] = [
  { key: 'SPOT', label: '12A 609 - SPOT - Spot', product: '12A', type: '609', offset: 2 },
  { key: 'TOM', label: '12A 602 - TOM - Tomorrow', product: '12A', type: '602', offset: 1 },
  { key: 'FWD', label: '12B 619 - FWD - Outright Forward', product: '12B', type: '619', offset: 30 },
  { key: 'NDF', label: '12D 631 - NDF - Non-Deliverable Forward', product: '12D', type: '631', offset: 30, ndf: true },
  { key: 'DNDF', label: '12D 632 - DNDF - Deliverable NDF', product: '12D', type: '632', offset: 30, ndf: true }
];
export const txnTypeOf = (key: string) => TXN_TYPES.find(t => t.key === key);

/** ZSGTSFTR TXN_STATUS: the workflow status of an FX transaction between FO, MO and BO. */
export const TXN_STATUS: Record<string, string> = {
  '01': 'FO Create', '02': 'FO Delete', '03': 'FO->MO: Unmatched', '04': 'MO->FO: Correction Required',
  '05': 'Error Correction - Reverse', '06': 'FO: Error Correction - Corrected', '07': 'MO Match & Release',
  '10': 'NDF Fixed', '16': 'Released to BO', '24': 'Exercised', '30': 'Settled', '34': 'Expired', '59': 'Offset Txn'
};
export const txnStatusTone = (code: string): 'green' | 'amber' | 'red' =>
  ['02', '05', '04'].includes(code) ? 'red' : ['01', '03', '06'].includes(code) ? 'amber' : 'green';

export interface FxModel { id: string; text: string; entityString: string; currencyString: string; noInvoice?: boolean; shortStraddle?: boolean }
export const MODELS: FxModel[] = [
  { id: 'M021', text: 'INR Long Forward', entityString: 'OIL-DMCC-OAIPL', currencyString: 'USD-USD-INR' },
  { id: 'M032', text: 'INR Paired Forward', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR' },
  { id: 'M033', text: 'INR-INR-INR Forward', entityString: 'OGA-OSIPL-DMCC', currencyString: 'INR-INR-INR' },
  { id: 'M034', text: 'USD Option Collar', entityString: 'OGA-DMCC-OTL', currencyString: 'USD-USD-USD' },
  { id: 'M036', text: 'Short Straddle', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR', shortStraddle: true },
  { id: 'M037', text: 'INR NDF', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR', noInvoice: true },
  { id: 'M041', text: 'Barley Forward', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR' }
];
export const modelOf = (id: string) => MODELS.find(m => m.id === id);

/** ZSGTSFTR_DEAL_ST (FX1): the status of a Deal ID. */
export const DEAL_STATUS: Record<string, string> = {
  '01': 'Deal Created', '04': 'Deal Released', '05': 'Pending Shipment Match', '10': 'BL Attached - Invoicing in Progress',
  '19': 'Settlement Due', '20': 'Settlement Initiated', '21': 'Settlement Completed - Execution', '25': 'Closed', '30': 'Cancelled'
};

export const CURRENCY_PAIRS = ['USD/INR', 'USD/SGD', 'USD/AED', 'USD/THB', 'EUR/USD', 'USD/VND'];
/** Base rates of the sample pairs (per 1 unit of the first currency). */
export const BASE_RATES: Record<string, number> = { 'USD/INR': 83.2, 'USD/SGD': 1.295, 'USD/AED': 3.6725, 'USD/THB': 36.4, 'EUR/USD': 1.163, 'USD/VND': 25350 };

/** Master contracts open for deals (ZMC_STAT 03 Confirmed / 04 In Use). */
export interface OpenMc { mc: string; model: string; commodity: string; pair: string; entityString: string; amountUsd: number; usedUsd: number; shipStart: string; shipEnd: string }
export const OPEN_MCS: OpenMc[] = [
  { mc: '2000002728', model: 'M032', commodity: 'C105 CORN', pair: 'USD/INR', entityString: 'OGA-DMCC-OSIPL', amountUsd: 2_500_000, usedUsd: 1_000_000, shipStart: '2026-10-22', shipEnd: '2026-12-15' },
  { mc: '2000002724', model: 'M041', commodity: 'C104 BARLEY', pair: 'USD/INR', entityString: 'OGA-DMCC-OSIPL', amountUsd: 1_800_000, usedUsd: 400_000, shipStart: '2026-11-01', shipEnd: '2027-01-31' },
  { mc: '2000000028', model: 'M033', commodity: 'C110 WHEAT', pair: 'USD/INR', entityString: 'OGA-OSIPL-DMCC', amountUsd: 3_000_000, usedUsd: 0, shipStart: '2026-11-10', shipEnd: '2027-02-28' }
];
