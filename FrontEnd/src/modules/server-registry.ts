import type { DashboardServer } from '@core/server/dashboard-types';
import { MODULES } from './registry';
import type { AnyModuleDef, ModuleSeed, ODataContract, RestContract } from './types';
import { contract as portfolioContract } from './samples/portfolio/contract';
import { portfolioServer } from './samples/portfolio/dashboard.server';
import { portfolioSeed } from './samples/portfolio/seed';
import { contract as timeBucketsContract } from './time-buckets/contract';
import timeBucketsSeed from './time-buckets/seed.json';
import { contract as settlementDataContract } from './settlement-data/contract';
import { rest as settlementDataRest } from './settlement-data/rest';
import { settlementSeed } from './settlement-data/seed';
import { contract as tsfDealIdContract } from './tsf-deal-id/contract';
import { rest as tsfDealIdRest } from './tsf-deal-id/rest';
import { tsfDealIdSeed } from './tsf-deal-id/seed';
import { contract as fxOverviewContract } from './fx-overview/contract';
import { fxOverviewServer } from './fx-overview/dashboard.server';
import { contract as masterContractContract } from './master-contract/contract';
import { rest as masterContractRest } from './master-contract/rest';
import { masterContractSeed } from './master-contract/seed';
import { contract as tsfDealsContract } from './tsf-deals/contract';
import { tsfDealsSeed } from './tsf-deals/seed';
import { contract as wbMastersContract } from './wb-masters/contract';
import { rest as wbMastersRest } from './wb-masters/rest';
import { wbMastersSeed } from './wb-masters/seed';
import { contract as trmFxAppContract } from './trm-fx-app/contract';
import { trmFxAppSeed } from './trm-fx-app/seed';
import { contract as fxTransactionContract } from './fx-transaction/contract';
import { fxTransactionSeed } from './fx-transaction/seed';
import { contract as commodityContract } from './commodity/contract';
import { commoditySeed } from './commodity/seed';
import { contract as commodityPriceContract } from './commodity-price/contract';
import { commodityPriceSeed } from './commodity-price/seed';
import { contract as tradeflowContract } from './tradeflow/contract';
import { tradeflowSeed } from './tradeflow/seed';
import { contract as tradeflowUploadContract } from './tradeflow-upload/contract';
import { tradeflowUploadSeed } from './tradeflow-upload/seed';
import { contract as tradeflowManageContract } from './tradeflow-manage/contract';
import { tradeflowManageSeed } from './tradeflow-manage/seed';
import { contract as blAssignContract } from './bl-assign/contract';
import { blAssignSeed } from './bl-assign/seed';
import { contract as dealsContract } from './samples/deals/contract';
import { dealsSeed } from './samples/deals/seed';
import { contract as monthlyContract } from './samples/monthly/contract';
import { monthlySeed } from './samples/monthly/seed';
import { contract as budgetContract } from './samples/budget/contract';
import { budgetSeed } from './samples/budget/seed';
import { contract as liquidityContract } from './samples/liquidity/contract';
import { liquiditySeed } from './samples/liquidity/seed';
import { contract as cashflowContract } from './samples/cashflow/contract';
import { cashflowSeed } from './samples/cashflow/seed';
import { contract as treasuryContract } from './samples/treasury/contract';
import { treasuryServer } from './samples/treasury/dashboard.server';
import { treasurySeed } from './samples/treasury/seed';

/**
 * Where a module's data lives: inside SAP (`sap`, through its OData service), the application's own data (`app`), or
 * an external REST data service the BackEnd calls (`rest`, FE + BE + DB only; its `rest` contract names the service).
 */
export type DataSource = 'sap' | 'app' | 'rest';
/** Sources whose data the BackEnd keeps in an FE + BE + DB application (the browser calls it through backend-api). */
export const BACKEND_SOURCES: readonly DataSource[] = ['app', 'rest'];
/** Whether the BackEnd answers this source's data (an FE + BE + DB application). */
export const keptByBackend = (source: DataSource | undefined): boolean => source !== undefined && BACKEND_SOURCES.includes(source);

export interface ModuleData {
  def: AnyModuleDef;
  /** Every module has one, except a report over another module (`source`), which reads that module's. */
  contract?: ODataContract;
  /** Every module has one, except a report over another module (`source`). */
  seed?: ModuleSeed | (() => ModuleSeed);
  /** Dashboard modules: their server part (section loaders). */
  dashboard?: DashboardServer;
  /** Source `rest`: the REST data service, its resources and their columns (BackEnd/src/rest/). */
  rest?: RestContract;
  /**
   * Where its data lives; absent while the module still runs on the sample data in `seed` (kept in memory). A report over
   * another module (`def.source`) leaves it out: its data source is that module's (see sourceOf; a value here is ignored).
   */
  source?: DataSource;
  /**
   * A template example registered back only for the template's own tests (FS Sprint moves the examples of a new application
   * to FrontEnd/tests/support/reference/): never one of the application's modules, so never in its generated schema.
   */
  reference?: true;
}

/**
 * Where a module's data lives, as every reader of a source asks it: its own `source`, or for a report over another
 * module (`def.source`) that module's source, so the report always runs and reads where that data lives.
 */
export function sourceOf(entry: ModuleData): DataSource | undefined {
  const from = entry.def.kind === 'report' ? entry.def.source?.module : undefined;
  if (!from) return entry.source;
  return Object.hasOwn(SERVER_MODULES, from) ? SERVER_MODULES[from].source : undefined;
}

/** The data parts of each module: its source, its OData contract and its sample data. */
export const SERVER_MODULES: Record<string, ModuleData> = {
  'sample-portfolio': { def: MODULES['sample-portfolio'], contract: portfolioContract, seed: () => portfolioSeed(), dashboard: portfolioServer },
  // master-contract: ZSGTSFTR_MAS_CON on the SLC middleware (rest); tsf-deals: ZFS_SB_TSFDEAL_O4_API through the relay.
  timebuckets: { def: MODULES.timebuckets, contract: timeBucketsContract, seed: timeBucketsSeed, source: 'sap' },
  'settlement-data': { def: MODULES['settlement-data'], contract: settlementDataContract, seed: () => settlementSeed(), source: 'rest', rest: settlementDataRest },
  'tsf-deal-id': { def: MODULES['tsf-deal-id'], contract: tsfDealIdContract, seed: () => tsfDealIdSeed(), source: 'rest', rest: tsfDealIdRest },
  'fx-overview': { def: MODULES['fx-overview'], contract: fxOverviewContract, seed: { tables: {} }, dashboard: fxOverviewServer, source: 'sap' },
  'master-contract': { def: MODULES['master-contract'], contract: masterContractContract, seed: () => masterContractSeed(), source: 'rest', rest: masterContractRest },
  'tsf-deals': { def: MODULES['tsf-deals'], contract: tsfDealsContract, seed: () => tsfDealsSeed(), source: 'sap' },
  'wb-masters': { def: MODULES['wb-masters'], contract: wbMastersContract, seed: () => wbMastersSeed(), source: 'rest', rest: wbMastersRest },
  'trm-fx-app': { def: MODULES['trm-fx-app'], contract: trmFxAppContract, seed: () => trmFxAppSeed(), source: 'sap' },
  'fx-transaction': { def: MODULES['fx-transaction'], contract: fxTransactionContract, seed: () => fxTransactionSeed(), source: 'sap' },
  // Master Data and Trade Flows: ZFS_SB_TRADEFLOW_O4_API (NIIF) through the relay; UI approved 2026-11-05.
  commodity: { def: MODULES.commodity, contract: commodityContract, seed: commoditySeed, source: 'sap' },
  'commodity-price': { def: MODULES['commodity-price'], contract: commodityPriceContract, seed: commodityPriceSeed, source: 'sap' },
  tradeflow: { def: MODULES.tradeflow, contract: tradeflowContract, seed: tradeflowSeed, source: 'sap' },
  'tradeflow-upload': { def: MODULES['tradeflow-upload'], contract: tradeflowUploadContract, seed: tradeflowUploadSeed, source: 'sap' },
  // Manage and Propose Tradeflows (UI approved 2026-11-05): TradeFlow → BillOfLading [0..*] on NIIF.
  'tradeflow-manage': { def: MODULES['tradeflow-manage'], contract: tradeflowManageContract, seed: tradeflowManageSeed, source: 'sap' },
  'bl-assign': { def: MODULES['bl-assign'], contract: blAssignContract, seed: blAssignSeed, source: 'sap' },
  'sample-deals': { def: MODULES['sample-deals'], contract: dealsContract, seed: () => dealsSeed(), source: 'app' },
  'sample-monthly': { def: MODULES['sample-monthly'], contract: monthlyContract, seed: monthlySeed },
  'sample-budget': { def: MODULES['sample-budget'], contract: budgetContract, seed: budgetSeed },
  'sample-liquidity': { def: MODULES['sample-liquidity'], contract: liquidityContract, seed: () => liquiditySeed() },
  'sample-cashflow': { def: MODULES['sample-cashflow'], contract: cashflowContract, seed: () => cashflowSeed() },
  'sample-treasury': { def: MODULES['sample-treasury'], contract: treasuryContract, seed: treasurySeed, dashboard: treasuryServer }
};
