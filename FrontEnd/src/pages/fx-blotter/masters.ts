// The masters the blotter's dropdowns and dialogs use, read live (live.ts) and handed down by context: trader groups and
// traders, the business partners of the group, company codes. Without a provider the lists are empty.
import { createContext, useContext } from 'react';

export interface Code { code: string; text: string }
export interface BlGroup { code: string; text: string; traders: Code[] }
export interface BlMasters {
  groups: BlGroup[];
  /** The business partners (banks) of the selected group. */
  banks: Code[];
  companies: Code[];
  bankText: (code: string) => string;
  companyText: (code: string) => string;
}

export const NO_MASTERS: BlMasters = { groups: [], banks: [], companies: [], bankText: c => c, companyText: c => c };
export const MastersContext = createContext<BlMasters>(NO_MASTERS);
export const useMasters = (): BlMasters => useContext(MastersContext);
