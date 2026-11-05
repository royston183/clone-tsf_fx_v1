// Sample workflow records for tests (the module reads SAP through the relay).
import type { ModuleSeed } from '../types';

const record = (companyCode: string, financialTransaction: string, txnStatus: string, dealId: string) => ({
  companyCode, financialTransaction, ztsfDealType: 'FX', ztsfDealID: dealId, ztsfDealDesc: 'Sample deal', txnStatus, ndfMoRem: '', zolamDealNo: '', blotterDate: '2026-11-01'
});
export const trmFxAppSeed = (): ModuleSeed => ({
  tables: { apps: [record('SG03', '2000000000001', '03', '7000000007'), record('IN11', '1700004101', '04', '7000000005')] }
});
