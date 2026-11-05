// The SAP tables the FX screens reach through /api/ref/localdb, as the reference gateway lists them (SAP's field names).
import type { DdicColumn } from './ddic';

const t = (name: string, max: number, key?: true): DdicColumn => (key ? { name, kind: 'text', max, key } : { name, kind: 'text', max });
const n = (name: string, max: number): DdicColumn => ({ name, kind: 'number', max });
const stamps = (): DdicColumn[] => [
  t('ZCREATED_BY', 12), t('ZCREATED_DATE', 8), t('ZCREATED_TIME', 6),
  t('ZCHANGED_BY', 12), t('ZCHANGED_DATE', 8), t('ZCHANGED_TIME', 6)
];

/** ZSGTSFTR_TRD_POS: Trade Invoice Posting Details (middleware resource trdPos). */
export const TRD_POS_COLUMNS: readonly DdicColumn[] = [
  t('ZDEAL_ID', 15, true), t('ZSEQ', 2, true), t('ZBUKRS', 4), t('ZT_TYPE', 4), t('ZRP', 50), t('ZSELL', 10), t('ZBUY', 10),
  n('ZAMT', 17), t('ZCURR', 5), t('ZDUE_DATE', 8), t('ZP_DATE', 8), t('ZD_MAP', 5), t('ZTRF_TYPE', 2), t('ZSET_TYPE', 50),
  t('ZSET_DESC', 120), t('ZSET_CHECK', 1), t('ZPOST_CHECK', 1), t('ZFI_TYPE', 2), t('ZPOST_DESC', 40), n('ZPAY_AMT', 17),
  t('ZSET_CURR', 5), t('ZAHLVID', 10), t('ZHBKID', 5), t('ZHKTID', 5), t('ZBELNR', 10), t('ZREC_HBKID', 5), t('ZREC_HKTID', 5),
  t('ZDOC_TYPE', 2), t('ZDR_PK', 2), t('ZDR_ACCNT', 10), t('ZDR_ACC', 2), t('ZDR_CV', 10), t('ZDR_PRCTR', 10), t('ZDR_RBUSA', 4),
  t('ZDR_GL', 10), t('ZCR_PK', 2), t('ZCR_ACCNT', 10), t('ZCR_ACC', 2), t('ZCR_CV', 10), t('ZCR_PRCTR', 10), t('ZCR_RBUSA', 4),
  t('ZCR_GL', 10), t('ZMSG', 80), t('ZEXE_CO', 1), t('ZACC_CO', 1), ...stamps()
];

/** ZSGTSFTR_TRD_ACC: Trade Invoice posting configuration (resource tsfTrdAcc). */
export const TRD_ACC_COLUMNS: readonly DdicColumn[] = [
  t('ZFI_TYPE', 2, true), t('ZPOST_DESC', 40), t('ZDOC_TYPE', 2), t('ZXBLNR1', 16), t('ZBKTXT', 25), t('ZDEBIT', 2), t('ZDR_ENT', 2),
  t('ZDR_ACC', 2), t('ZDR_TEXT', 60), t('ZCREDIT', 2), t('ZCR_ENT', 2), t('ZCR_ACC', 2), t('ZCR_TEXT', 60), t('ZREF1', 20),
  t('ZREF2', 20), ...stamps()
];

/** ZSGTSFTR_DEALDMS: a Deal ID's attached documents (resource tsfDealdms). */
export const DEALDMS_COLUMNS: readonly DdicColumn[] = [
  t('ZDMS_CAT', 2, true), t('ZDMS_TYPE', 3, true), t('ZDEAL_ID', 10, true), t('ZDDATE', 8), t('ZDMS_CODE', 10), t('ZSTND_DMS', 25), ...stamps()
];
/** DATS columns: stored YYYYMMDD, spoken YYYY-MM-DD. */
export const DEALDMS_DATES = ['ZDDATE', 'ZCREATED_DATE', 'ZCHANGED_DATE'] as const;
/** TIMS columns: stored HHMMSS, spoken HH:MM:SS. */
export const DEALDMS_TIMES = ['ZCREATED_TIME', 'ZCHANGED_TIME'] as const;

/** ZSGTSFTR_DMS_TYP: DMS document types per category (resource dmsType, upper-case columns). */
export const DMS_TYP_COLUMNS: readonly DdicColumn[] = [
  t('ZDMS_CAT', 2, true), t('ZDMS_TYPE', 3, true), t('ZDMS_DESC', 100), t('ZDMS_DTYPE', 3), t('ZDMS_DDESC', 20), t('ZSHORT_DESC', 50),
  t('ZDMS_OBJ', 10), t('ZDMS_RANGE', 2), t('ZDMS_FROM', 20), t('ZDMS_TO', 20), ...stamps()
];

/** ZSGTSFTR_DAYLOCK: TRM Day Wise Locking (resource daylock, upper-case columns). */
export const DAYLOCK_BLOTTER = 'DE6';
export const DAYLOCK_CO_AREA = 'OL10';
export const DAYLOCK_COLUMNS: readonly DdicColumn[] = [
  t('ZCO_AREA', 4, true), t('ZMONTH', 3, true), t('ZYEAR', 4, true), t('ZTYPE', 10, true), t('ZB_TYPE', 30, true), t('ZPDATE', 8, true),
  t('ZGRP', 3, true), t('ZLOCKED', 1), ...stamps()
];

/** ZSGTSFTR_LIM_MAN: the FX limits (resource limMan). */
export const LIM_MAN_COLUMNS: readonly DdicColumn[] = [
  t('ZYEAR', 4, true), t('ZCURR_PAIR', 7, true), t('ZLIMIT_STARTDT', 8, true), t('ZLIMIT_MATDT', 8, true), t('ZCURR', 5),
  n('ZINI_AAMT', 17), n('ZAD_AAMT', 17), n('ZUNAPROV_AMT', 17), n('ZUTL_AMT', 17), t('ZLIM_SET', 1), t('ZLIM_APP', 1), t('ZLIM_REJ', 1),
  t('ZLIM_ADDLIM', 1), ...stamps()
];

/** ZSGTRMTR_CURPAIR: currency pairs offered for trading (resource curpair). */
export const CURPAIR_COLUMNS: readonly DdicColumn[] = [
  t('F_CURR', 5, true), t('T_CURR', 5, true), t('BUKRS', 4), t('PAIR', 7), t('CREATED_BY', 12), t('CREATED_DATE', 8), t('CREATED_TIME', 6),
  t('UPUSER', 12), t('DUPDAT', 8), t('TUPTIM', 6), n('DIV_RATIO', 9)
];

/** ZSGTRMTR_FIELDS: field names (resource fields). */
export const FIELDS_COLUMNS: readonly DdicColumn[] = [
  t('ZFIELD', 30, true), t('ZNAME', 30), t('CREATED_BY', 12), t('CREATED_DATE', 8), t('CREATED_TIME', 6), t('CHANGED_BY', 12),
  t('CHANGED_DATE', 8), t('CHANGED_TIME', 6)
];

/** TSF_FX_POST_DOC: the FI documents PostFlows returned for an FX deal leg, kept in the BackEnd's database (migration 0005). */
export const FX_POST_DOC_TABLE = 'tsf_fx_post_doc';
export const FX_POST_DOC_COLUMNS: readonly DdicColumn[] = [
  t('ZBUKRS', 4, true), t('ZRFHA', 13, true), t('ZDOC1', 10), t('ZGJAHR1', 4), t('ZDOC2', 10), t('ZGJAHR2', 4), t('ZMSG', 255), ...stamps()
];
