// Value helps of the master contract (sample values from the reference's legacy page; middleware masters later).
import type { Option } from '@/lib/grid/types';

/** Origin entities: ZSGTSFTR_COMP with ZORIGIN = 'X' (plus SG03). */
export const ORIGINS: (Option & { company: string; currency: string })[] = [
  { value: 'OSIPL', label: 'OSIPL · IN11 · Olam Agri India Pvt Ltd', company: 'IN11', currency: 'INR' },
  { value: 'OTL', label: 'OTL · TH10 · Olam Thailand Ltd', company: 'TH10', currency: 'THB' },
  { value: 'OVL', label: 'OVL · VN10 · Olam Vietnam Ltd', company: 'VN10', currency: 'VND' },
  { value: 'OGA', label: 'OGA · SG03 · Olam Global Agri Pte. Ltd.', company: 'SG03', currency: 'USD' }
];
export const originOf = (code: unknown) => ORIGINS.find(o => o.value === code);

export const COMMODITIES: Option[] = [
  { value: 'C104', label: 'C104 - BARLEY' }, { value: 'C105', label: 'C105 - CORN' }, { value: 'C110', label: 'C110 - WHEAT' },
  { value: 'C112', label: 'C112 - SOYOIL' }, { value: 'C118', label: 'C118 - RICE' }, { value: 'C126', label: 'C126 - Fertilizer' }
];

export const PAY_TERMS: Option[] = [
  { value: 'P01', label: 'P01 - 270 days from bill of lading date' }, { value: 'P02', label: 'P02 - 180 days from bill of lading date' },
  { value: 'P03', label: 'P03 - 90 days from bill of lading date' }, { value: 'P04', label: 'P04 - 60 days from invoice date' },
  { value: 'P05', label: 'P05 - 30 days from invoice date' }, { value: 'P06', label: 'P06 - Cash against documents' }
];

export const PORTS: Option[] = [
  { value: 'SGSIN', label: 'SGSIN - Singapore' }, { value: 'INMUN', label: 'INMUN - Mundra' }, { value: 'INNSA', label: 'INNSA - Nhava Sheva' },
  { value: 'AEJEA', label: 'AEJEA - Jebel Ali' }, { value: 'THBKK', label: 'THBKK - Bangkok' }, { value: 'BRSSZ', label: 'BRSSZ - Santos' }
];

export const MODELS = [
  { id: 'M032', text: 'INR Paired Forward', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR' },
  { id: 'M033', text: 'INR-INR-INR Forward', entityString: 'OGA-OSIPL-DMCC', currencyString: 'INR-INR-INR' },
  { id: 'M034', text: 'THB Forward', entityString: 'OGA-DMCC-OTL', currencyString: 'USD-USD-THB' },
  { id: 'M036', text: 'Short Straddle', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR' },
  { id: 'M041', text: 'Barley Forward', entityString: 'OGA-DMCC-OSIPL', currencyString: 'USD-USD-INR' }
];
export const modelOf = (id: unknown) => MODELS.find(m => m.id === id);

/** ZSGTSFTR_MC_STAT: the master contract lifecycle. */
export const MC_STATUS: Option[] = [
  { value: '01', label: 'Created by FO' }, { value: '02', label: 'Release to MO' }, { value: '03', label: 'Confirmed by MO' }, { value: '04', label: 'In-Use' },
  { value: '09', label: 'Expired' }, { value: '11', label: 'MO->FO: Correction Required' }, { value: '12', label: 'FO: Error Correction - Reverse' },
  { value: '13', label: 'FO: Error Correction - Correct' }, { value: '20', label: 'Cancelled' }, { value: '21', label: 'MO->FO: Correction after Deal' },
  { value: '22', label: 'FO: Error Correction - Correct' }
];
export const mcStatusText = (code: unknown) => MC_STATUS.find(s => s.value === code)?.label ?? String(code ?? '');
export const mcStatusTone = (code: unknown): 'green' | 'amber' | 'red' =>
  ['03', '04'].includes(String(code)) ? 'green' : ['09', '11', '12', '20', '21'].includes(String(code)) ? 'red' : 'amber';
