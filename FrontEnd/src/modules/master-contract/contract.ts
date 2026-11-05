import type { ODataContract } from '../types';

// The master contract is the application's own data (ZSGTSFTR_MAS_CON, moved from the Azure middleware into this
// application's database once the UI is approved). The contract names its table for the module service.
export const contract: ODataContract = {
  service: 'TSF_MASTER_CONTRACT',
  naming: 'pascal',
  etag: true,
  tables: { contracts: { entitySet: 'MasterContract' } },
  object: { items: {}, actions: { 'send-to-mo': 'SendToMo' } }
};
