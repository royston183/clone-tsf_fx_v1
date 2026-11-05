import type { ODataContract } from '../types';

// ZFS_SB_TRMFXAPP_O4_API: TrmFxApp (ZSGTSFTR_APP_STR), key CompanyCode + FinancialTransaction, ETag LocalLastChangedAt.
// Properties follow the field names (ztsfDealID -> ZtsfDealID); checked against the live $metadata.
export const contract: ODataContract = {
  service: 'ZFS_SB_TRMFXAPP_O4_API',
  naming: 'pascal',
  etag: true,
  flagType: 'boolean',
  tables: { apps: { entitySet: 'TrmFxApp' } },
  object: { items: {} }
};
