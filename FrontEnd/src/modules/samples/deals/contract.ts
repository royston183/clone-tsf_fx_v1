import type { ODataContract } from '../../types';

// Illustrative OData V4 contract of the Deals sample (binding ZFS_SB_SAMPLEDEAL_O4_API). The app never sets its URL,
// so the sample is the application's own data (source 'app'); integration tests point it at the mock SAP server.
export const contract: ODataContract = {
  service: 'ZFS_SB_SAMPLEDEAL_O4_API',
  naming: 'pascal',
  etag: true,
  numbers: ['seq'],
  keyTypes: { seq: 'number' },
  tables: { deals: { entitySet: 'Deal' }, flows: { entitySet: 'DealFlow' } },
  object: { items: { flows: { navigation: '_Flows' } }, actions: { release: 'com.sap.gateway.srvd_a2x.zfs_sd_sampledeal.v0001.Release' } }
};
