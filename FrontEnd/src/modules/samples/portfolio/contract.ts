import type { ODataContract } from '../../types';

// Illustrative contract of the portfolio sample (sample data only), which shows every dashboard part. It is a pattern for
// an Overview's parts, never an Overview to copy or adapt: an application's own Overview reads its own modules.
export const contract: ODataContract = { service: 'ZFS_SB_SAMPLEOVW_O4_API', naming: 'pascal', tables: { deals: { entitySet: 'PortfolioDeal' } } };
