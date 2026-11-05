import type { ODataContract } from '../types';

// The Overview reads the TSF deals (SAP, ZFS_SB_TSFDEAL_O4_API) and the master contracts (SLC middleware, through the
// BackEnd); it has no entity of its own. Source 'sap': it runs in the browser, where the SAP report runs.
export const contract: ODataContract = { service: 'ZFS_SB_TSFDEAL_O4_API', naming: 'pascal', tables: {} };
