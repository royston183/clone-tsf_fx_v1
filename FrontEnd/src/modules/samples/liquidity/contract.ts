import type { ODataContract } from '../../types';

// Illustrative contract of the Liquidity Statement sample (binding ZFS_SB_SAMPLELIQ_O4_API); used by integration tests only.
export const contract: ODataContract = {
  service: 'ZFS_SB_SAMPLELIQ_O4_API',
  naming: 'pascal',
  numbers: ['seq'],
  tables: { statement: { entitySet: 'LiquidityRow' } }
};
