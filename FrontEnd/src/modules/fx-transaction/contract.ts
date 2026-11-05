import type { ODataContract } from '../types';

// ZFS_SB_TRMFX_O4_API: FxTransaction, key CompanyCode + FinancialTransaction. The entity has no ETag (the action is sent
// without If-Match). Bound actions Settle and NdfFixing live in the service's namespace.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRMFX_O4_API',
  naming: 'pascal',
  numbers: ['buyAmount', 'sellAmount', 'spotRate', 'swapRate', 'forwardRate'],
  tables: { transactions: { entitySet: 'FxTransaction' } },
  object: { items: {}, actions: { settle: 'com.sap.gateway.srvd_a2x.zfs_sd_trmfx.v0001.Settle' } }
};
