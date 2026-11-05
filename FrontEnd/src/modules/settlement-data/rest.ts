// Where the settlement data lives: the SLC middleware (Azure), shared with the TSF - FX Application. TRD_POS and IN_SPOT are written
// by the screen; everything else is read. Numbers are sent as JSON numbers.
import type { RestContract } from '../types';
import { BILL_ADJ, FX_MODEL, INV_REF, IN_SPOT, IN_SPOT_STAMPS, SET_FX, SET_SPT, SET_TYP, TRD_ACC, TRD_POS, TRD_POS_STAMPS, TSF_PAY } from './columns';

export const rest: RestContract = {
  service: 'slc-middleware',
  lookups: {
    statuses: { resource: 'tsfDealStatus', columns: { dealType: 'ZDEAL_TYPE', subType: 'ZSUB_TYPE', status: 'ZDEAL_STAT', text: 'ZDEAL_SDESC', desc: 'ZDESC' } },
    traders: { resource: 'trmTrader', columns: { code: 'ZTCODE', name: 'ZNAME', trader: 'ZTRADER' } }
  },
  tables: {
    positions: { resource: 'trdPos', numbers: ['amt', 'payAmt'], columns: TRD_POS, stamps: TRD_POS_STAMPS },
    setTyp: { resource: 'setTyp', columns: SET_TYP },
    setFx: { resource: 'setFx', columns: SET_FX },
    billAdj: { resource: 'billAdjustment', numbers: ['amtUsd', 'amt'], columns: BILL_ADJ },
    invRef: { resource: 'invRef', numbers: ['amt', 'invAmt', 'exRate'], columns: INV_REF },
    inSpot: { resource: 'inSpot', numbers: ['fAmt', 'fxAmt', 'dAmt'], columns: IN_SPOT, stamps: IN_SPOT_STAMPS },
    setSpt: { resource: 'setSpt', columns: SET_SPT },
    tsfPay: { resource: 'tsfPay', columns: TSF_PAY },
    models: { resource: 'fxModel', columns: FX_MODEL },
    postingTypes: { resource: 'tsfTrdAcc', columns: TRD_ACC }
  }
};
