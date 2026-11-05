import type { ODataContract } from '../../types';

// Illustrative contract of the Budget Upload sample (binding ZFS_SB_SAMPLEBUDGET_O4_API); used by integration tests only.
export const contract: ODataContract = {
  service: 'ZFS_SB_SAMPLEBUDGET_O4_API',
  naming: 'pascal',
  etag: true,
  tables: { budget: { entitySet: 'BudgetLine' } }
};
