// Sample rows for tests (the module itself reads the SLC middleware).
import type { ModuleSeed } from '../types';

export const settlementSeed = (): ModuleSeed => ({
  tables: {
    positions: [], setTyp: [], setFx: [], billAdj: [], invRef: [], inSpot: [], setSpt: [], tsfPay: [], models: [], postingTypes: []
  },
  lookups: { statuses: [{ dealType: 'FX', subType: 'FX1', status: '20', text: 'Settlement Initiated', desc: 'Forex & Options' }], traders: [] }
});
