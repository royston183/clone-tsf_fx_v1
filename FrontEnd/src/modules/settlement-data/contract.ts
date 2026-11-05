import type { ODataContract } from '../types';

// The settlement data lives on the SLC middleware (rest.ts); this contract only names the tables for the module service.
export const contract: ODataContract = {
  service: 'SETTLEMENT_DATA', naming: 'pascal',
  tables: {
    positions: { entitySet: 'TrdPos' }, setTyp: { entitySet: 'SetTyp' }, setFx: { entitySet: 'SetFx' }, billAdj: { entitySet: 'BillAdj' },
    invRef: { entitySet: 'InvRef' }, inSpot: { entitySet: 'InSpot' }, setSpt: { entitySet: 'SetSpt' }, tsfPay: { entitySet: 'TsfPay' },
    models: { entitySet: 'FxModel' }, postingTypes: { entitySet: 'TrdAcc' }
  }
};
