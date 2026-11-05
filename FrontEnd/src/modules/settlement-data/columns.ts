// The SLC middleware tables the MO: Execute Settlement for Deal ID screen reads (and, for trdPos and inSpot, writes):
// resource → module field → the service's column. Fields are the column in camel case without its leading Z.
// The audit columns (ZCREATED_BY …) are the contract's `stamps`, never fields.

/** ZDEAL_ID → dealId, ZT_TYPE → tType, zd_map → dMap. */
export const fieldOfColumn = (column: string): string => column.toLowerCase().replace(/^z/, '').replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
const cols = (names: string): Record<string, string> => Object.fromEntries(names.trim().split(/\s+/).map(c => [fieldOfColumn(c), c]));

/** ZSGTSFTR_TRD_POS (cloud trdPos): the stored settlement state of each trade invoice leg of a Deal ID. Key: ZDEAL_ID + ZSEQ. */
export const TRD_POS = cols(`zdeal_id zseq zbukrs zt_type zrp zsell zbuy zamt zcurr zdue_date zp_date zd_map ztrf_type zset_type zset_desc
  zset_check zpost_check zfi_type zpost_desc zpay_amt zset_curr zhbkid zhktid zbelnr zrec_hbkid zrec_hktid zdoc_type zmsg zexe_co`);
/** ZSGTSFTR_SET_TYP: the model's trade invoice legs. */
export const SET_TYP = cols(`ZMOD_ID ZT_TYP_NO ZT_TYPE ZMOD_DESC ZDSS_DEAL ZBUKRS ZSELL ZBUY ZCURR ZSET_CURR ZPREM_ADJ ZSEQ ZD_MAP ZTRF_TYPE ZLET_CODE
  ZSET_TYPE ZSET_DESC ZSET_CHECK ZPOST_CHECK ZFI_TYPE ZPOST_DESC ZHEAD_FX ZACTFX`);
/** ZSGTSFTR_SET_FX: the model's FX deals (buy / sell rows per deal type). */
export const SET_FX = cols('ZMOD_ID ZD_MAP ZBS ZT_TYPE ZMOD_DESC ZBUKRS ZDSS_DEAL ZCURR ZRBUKRS ZBANK_ID ZPAY_ID ZACC ZSEQ ZTRF_TYPE ZLET_CODE ZLET_NAME ZSET_TYPE ZSET_DESC');
/** ZSGTSFTR_BIL_ADJ: the final invoice values of a Deal ID. */
export const BILL_ADJ = cols('ZDEAL_ID ZINV_REF ZINV_TYPE ZPRE_T_REF ZINV_DATE ZDUE_DATE ZSELL ZBUY ZAMT_USD ZAMT ZCURR ZBUKRS ZBP ZHBKID ZHKTID ZPTNR_BKID');
/** ZSGTSFTR_INV_REF: the planned trade invoices of a Deal ID. */
export const INV_REF = cols('ZDEAL_ID ZINV_TRM_NO ZTTYPE ZDTYPE ZTRD_SELL ZTRD_BUY ZMC_REF_P ZMC_REF_S ZAMT ZINV_AMT ZTRD_CURR ZEX_RATE');
/** ZSGTSFTR_IN_SPOT: the invoice-difference rows the FO workbench books spots from. Key: ZMOD_ID + ZDEAL_ID + ZDEAL_TYPE + ZDSS_TYPE. */
export const IN_SPOT = cols('ZMOD_ID ZDEAL_ID ZDEAL_TYPE ZDSS_TYPE ZBUKRS ZRFHA ZT_TYPE ZF_AMT ZFX_AMT ZCURR ZD_AMT ZBS ZSBUKRS ZSPOT_TXN ZSPOT_CREATE ZEXPIRY');
/** ZSGTSFTR_SET_SPT: the model's spot company and buy / sell by the sign of the difference. */
export const SET_SPT = cols('ZCO_AREA ZMOD_ID ZSIGN ZD1_BUKRS ZD1_BCURR ZD2_BUKRS ZD2_BCURR ZD1_LINK ZD2_LINK');
/** ZSGTSFTR_TSF_PAY: the model's trade-wise spot company and buy / sell. */
export const TSF_PAY = cols('ZCO_AREA ZMOD_ID ZD1_BUKRS ZD1_BCURR ZD2_BUKRS ZD2_BCURR');
/** ZSGTSFTR_RULE_BT: the FX models (flags and invoice links). */
export const FX_MODEL = cols(`ZCO_AREA ZMOD_ID ZLINK_MODEL ZMOD_DESC ZNO_INV ZTYPE ZSUB_TYPE ZENT_ID ZENT_DESC ZCURR_ID ZCURR_DESC ZD1_PUT_CALL
  ZD1_INV_LINK ZD1_INV_LINK2 ZD2_PUT_CALL ZD2_INV_LINK ZD2_INV_LINK2 ZSS`);
/** ZSGTSFTR_TRD_ACC (cloud tsfTrdAcc): the posting types of the trade invoice settlement. */
export const TRD_ACC = cols('zfi_type zpost_desc zdoc_type zxblnr1 zdr_text zcr_text');

/** The audit columns of the two tables the screen writes. */
export const TRD_POS_STAMPS = { createdBy: 'zcreated_by', createdDate: 'zcreated_date', createdTime: 'zcreated_time', changedBy: 'zchanged_by', changedDate: 'zchanged_date', changedTime: 'zchanged_time' };
export const IN_SPOT_STAMPS = { createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', createdTime: 'ZCREATED_TIME', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE', changedTime: 'ZCHANGED_TIME' };

/** Table ids of the module (its tabs) and the keys of each. */
export const KEYS = {
  positions: ['dealId', 'seq'],
  setTyp: ['modId', 'typNo', 'tType'],
  setFx: ['modId', 'dMap', 'bs'],
  billAdj: ['dealId', 'invRef', 'invType', 'preTRef'],
  invRef: ['dealId', 'invTrmNo'],
  inSpot: ['modId', 'dealId', 'dealType', 'dssType'],
  setSpt: ['coArea', 'modId', 'sign'],
  tsfPay: ['coArea', 'modId'],
  models: ['coArea', 'modId', 'linkModel'],
  postingTypes: ['fiType']
} as const;
