import type { AnyModuleDef, ModuleDef, ModuleKind } from './types';
import { portfolio } from './samples/portfolio/definition';
import { deals } from './samples/deals/definition';
import { monthly } from './samples/monthly/definition';
import { budget } from './samples/budget/definition';
import { liquidity } from './samples/liquidity/definition';
import { cashflow } from './samples/cashflow/definition';
import { treasury } from './samples/treasury/definition';
import { masterContract } from './master-contract/definition';
import { tsfDeals } from './tsf-deals/definition';
import { fxOverview } from './fx-overview/definition';
import { tsfDealId } from './tsf-deal-id/definition';
import { timeBuckets } from './time-buckets/definition';
import { settlementData } from './settlement-data/definition';
import { wbMasters } from './wb-masters/definition';
import { trmFxApp } from './trm-fx-app/definition';
import { fxTransaction } from './fx-transaction/definition';
import { commodity } from './commodity/definition';
import { commodityPrice } from './commodity-price/definition';
import { tradeflow } from './tradeflow/definition';
import { tradeflowUpload } from './tradeflow-upload/definition';
import { tradeflowManage } from './tradeflow-manage/definition';
import { blAssign } from './bl-assign/definition';

// Definitions differ only in their lookup type; the Workbench and planner are generic over it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous lookup types in one registry
export type AnyModule = ModuleDef<any>;

export const kindOf = (def: AnyModuleDef): ModuleKind => def.kind ?? 'table';
export const isTableModule = (def: AnyModuleDef): def is AnyModule => kindOf(def) === 'table';

/** Module id (catalog `module`) → definition. Register every new application here. */
export const MODULES: Record<string, AnyModuleDef> = {
  'sample-portfolio': portfolio,
  'fx-overview': fxOverview,
  'tsf-deal-id': tsfDealId,
  // The template's reference SAP module, retained for the isolated test examples.
  timebuckets: timeBuckets,
  'settlement-data': settlementData,
  'master-contract': masterContract,
  'tsf-deals': tsfDeals,
  'wb-masters': wbMasters,
  'trm-fx-app': trmFxApp,
  'fx-transaction': fxTransaction,
  commodity,
  'commodity-price': commodityPrice,
  tradeflow,
  'tradeflow-upload': tradeflowUpload,
  'tradeflow-manage': tradeflowManage,
  'bl-assign': blAssign,
  'sample-deals': deals,
  'sample-monthly': monthly,
  'sample-budget': budget,
  'sample-liquidity': liquidity,
  'sample-cashflow': cashflow,
  'sample-treasury': treasury
};
