import type { ODataContract } from '../types';

// ZFS_SB_TSFDEAL_O4_API (package ZFS_SLC_APP): the custom entity ZFS_CE_TsfDeal reads ZSGTSFTR_APP_STR (TSF Deal ID,
// blotter date, status, trader) and completes each row with the FX amounts and rates of BAPI_FTR_FXT_DEALGET.
// Read only. Filters and sorting work on the append-data fields only (amounts and rates come from the BAPI).
export const contract: ODataContract = {
  service: 'ZFS_SB_TSFDEAL_O4_API',
  naming: 'pascal',
  numbers: ['amount1', 'amount2', 'spotRate', 'swapRate', 'allInRate'],
  flagType: 'boolean',
  tables: {
    deals: {
      entitySet: 'TsfDeal',
      fields: {
        rfha: 'FinancialTransaction', dealId: 'TsfDealId', dealDesc: 'TsfDealDesc', partner: 'PartnerName', partnerCode: 'Partner',
        tradeDate: 'ContractDate', bs1: 'BuySell1', curr1: 'Currency1', bs2: 'BuySell2', curr2: 'Currency2', allInRate: 'ForwardRate',
        trader: 'TraderCode', intRef: 'InternalReference', statusText: 'TxnStatusText', mcRef: 'McRefNo',
        ndfFixDate: 'NdfFixingDate', ndfRef: 'FixingReferenceId', ndfFoRemark: 'NdfFoRemark', ndfMoRemark: 'NdfMoRemark'
      }
    }
  }
};
