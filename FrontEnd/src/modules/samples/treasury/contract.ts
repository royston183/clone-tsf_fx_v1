import type { ODataContract } from '../../types';

// The Treasury Overview reads through the two sample reports (ctx.report); its own service has no tables.
export const contract: ODataContract = { service: 'ZFS_SB_SAMPLETRY_O4_API', naming: 'pascal', tables: {} };
