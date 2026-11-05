// The masters of the FX Trader Workbench and Blotter on the SLC middleware (Azure). Read only: nothing here is written.
import type { RestContract } from '../types';

export const rest: RestContract = {
  service: 'slc-middleware',
  lookups: {
    // ZSGTSFTR_RULE_BT: FX models with their sub type, short-straddle flag and region.
    models: { resource: 'fxModel', columns: { id: 'ZMOD_ID', text: 'ZMOD_DESC', subType: 'ZSUB_TYPE', ss: 'ZSS', regionId: 'ZREG_ID', regionText: 'ZREGION_DESC', entityString: 'ZENT_DESC', currencyString: 'ZCURR_DESC', noInvoice: 'ZNO_INV' } },
    // ZSGTSFTR_DEAL_ST for the FX sub type: the Deal ID status texts.
    dealStatus: { resource: 'tsfDealStatus', filter: { ZSUB_TYPE: 'FX1' }, columns: { code: 'ZDEAL_STAT', text: 'ZDEAL_SDESC' } },
    // ZSGTSFTR_TXNSTAT (type 01): the transaction status texts.
    txnStatus: { resource: 'txnstat', filter: { ZTYPE: '01' }, columns: { code: 'ZTXN_STAT', text: 'ZTXN_STAT_DESC' } },
    groups: { resource: 'trdGrp', columns: { traderCode: 'ZTCODE', group: 'ZGRP', name: 'ZNAME', short: 'ZTRADER', groupText: 'ZGRP_DESC', lead: 'ZTLEAD' } },
    bpGroups: { resource: 'bpGrp', columns: { bp: 'BP', group: 'ZGRP', groupText: 'ZGRP_DESC' } },
    bps: { resource: 'trmBpext', columns: { bp: 'BP', name: 'BP_NAME', short: 'SHORT_NAME' } },
    companies: { resource: 'comp', columns: { code: 'ZBUKRS', name: 'ZBUTXT', entity: 'ZCOM_ID', currency: 'ZWAERS' } },
    // ZSGTSFTR_TRDWAI: the action item texts per transaction type.
    actions: { resource: 'trdwai', columns: { txnType: 'ZSFHAART', name: 'ZTXN_NAME', code: 'ZTEXT_CODE', text: 'ZACT_TEXT' } },
    // ZSGTSFTR_IN_SPOT: settlement data per Deal ID (invoice amount, difference, spot created).
    inSpot: { resource: 'inSpot', columns: { model: 'ZMOD_ID', dealId: 'ZDEAL_ID', dealType: 'ZDEAL_TYPE', dssType: 'ZDSS_TYPE', company: 'ZBUKRS', rfha: 'ZRFHA', invoiceAmt: 'ZF_AMT', fxAmt: 'ZFX_AMT', curr: 'ZCURR', diffAmt: 'ZD_AMT', bs: 'ZBS', spotTxn: 'ZSPOT_TXN', spotCreate: 'ZSPOT_CREATE', expiry: 'ZEXPIRY' } },
    // ZSGTSFTR_SS_SPOT: the spot legs of the short-straddle models.
    ssSpot: { resource: 'ssSpot', columns: { model: 'ZMOD_ID', opBs: 'ZOP_BS', pc: 'ZPC', bs1: 'ZBS1', curr1: 'ZCURR1', bs2: 'ZBS2', curr2: 'ZCURR2' } }
  },
  tables: {
    traders: { resource: 'trmTrader', columns: { code: 'ZTCODE', name: 'ZNAME', short: 'ZTRADER' } }
  }
};
