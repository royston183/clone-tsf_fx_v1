import type { ODataContract } from '../../types';

// Illustrative contract of the Cash Flow Lines sample (binding ZFS_SB_SAMPLEFLOW_O4_API); used by integration tests only.
export const contract: ODataContract = {
  service: 'ZFS_SB_SAMPLEFLOW_O4_API',
  naming: 'pascal',
  tables: { flows: { entitySet: 'CashFlowLine' } }
};
