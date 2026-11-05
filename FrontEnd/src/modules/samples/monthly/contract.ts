import type { ODataContract } from '../../types';

// Illustrative contract of the Monthly Amounts sample (binding ZFS_SB_SAMPLEAMT_O4_API); used by integration tests only.
export const contract: ODataContract = {
  service: 'ZFS_SB_SAMPLEAMT_O4_API',
  naming: 'pascal',
  etag: true,
  tables: { amounts: { entitySet: 'MonthlyAmount' } }
};
