import type { ODataContract } from '../types';

// Read only, on the SLC middleware (see rest.ts); the contract only names the table for the module service.
export const contract: ODataContract = { service: 'WB_MASTERS', naming: 'pascal', tables: { traders: { entitySet: 'Trader' } } };
