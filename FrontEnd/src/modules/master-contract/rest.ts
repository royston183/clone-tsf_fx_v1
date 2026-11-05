// Where the master contracts live: ZSGTSFTR_MAS_CON on the SLC middleware (Azure), shared with the TSF - FX Application.
// The descriptive columns are worked out on every save from the middleware's own masters, as the reference screen does.
import type { Row } from '@/lib/grid/types';
import type { RestContract } from '../types';

const text = (rows: Row[] | undefined, key: string, value: string, field: string) => rows?.find(r => r[key] === value)?.[field] ?? '';

export const rest: RestContract = {
  service: 'slc-middleware',
  lookups: {
    origins: { resource: 'comp', filter: { ZORIGIN: 'X' }, columns: { entity: 'ZCOM_ID', company: 'ZBUKRS', name: 'ZBUTXT', currency: 'ZWAERS' } },
    commodities: { resource: 'commodity', columns: { code: 'ZCOM_ID', text: 'ZCOM_DESC' } },
    models: { resource: 'fxModel', columns: { id: 'ZMOD_ID', text: 'ZMOD_DESC', entityId: 'ZENT_ID', entityDesc: 'ZENT_DESC', currencyId: 'ZCURR_ID', currencyDesc: 'ZCURR_DESC' } },
    payTerms: { resource: 'paymentTerm', columns: { code: 'ZTERM', text: 'ZTEXT1' } },
    statuses: { resource: 'mcStatus', columns: { code: 'ZMC_ID', text: 'ZMC_STAT' } }
  },
  tables: {
    contracts: {
      resource: 'masterContract',
      assigned: 'mcNo',
      numbers: ['amountUsd', 'exRate', 'amountOrigin', 'utilised'],
      columns: {
        mcNo: 'ZMC_REF_NO', mcRef: 'ZMC_DESC', mcDate: 'ZMC_DATE', status: 'ZMC_STAT', origin: 'ZORIGIN',
        amountUsd: 'ZAMT', currency: 'ZCURR', exRate: 'ZEX_RATE', amountOrigin: 'ZORG_AMT', originCurrency: 'ZOCURR',
        shipStart: 'ZSHIP_START', shipEnd: 'ZSHIP_END', commodity: 'ZCOMMODITY', commodityDesc: 'ZCOM_DESC', comDescLong: 'ZCOM_DESC_LONG',
        entityId: 'ZENT_ID', entityDesc: 'ZENT_DESC', currencyId: 'ZCURR_ID', currencyDesc: 'ZCURR_DESC', model: 'ZMOD_ID', modelDesc: 'ZMOD_DESC',
        payTerms: 'ZPAY_TERMS', payTermsText: 'ZPAY_TERMS_TEXT', pos: 'ZPOS', pod: 'ZPOD', oldMcNo: 'ZOLD_MC_REF_NO', utilised: 'ZUTI_AMT',
        moRemarks: 'ZMO_REMARKS', foRemarks: 'ZFO_REMARKS'
      },
      stamps: { createdBy: 'ZCREATED_BY', createdDate: 'ZCREATED_DATE', createdTime: 'ZCREATED_TIME', changedBy: 'ZCHANGED_BY', changedDate: 'ZCHANGED_DATE', changedTime: 'ZCHANGED_TIME' },
      // As the reference's create: USD is the contract currency; the origin amount is USD × rate in the origin's currency.
      derive: (row, lk) => {
        const usd = Number(row.amountUsd), rate = Number(row.exRate);
        return {
          currency: 'USD',
          originCurrency: text(lk.origins, 'entity', row.origin, 'currency'),
          amountOrigin: usd > 0 && rate > 0 ? (usd * rate).toFixed(2) : '0',
          commodityDesc: text(lk.commodities, 'code', row.commodity, 'text'),
          entityId: text(lk.models, 'id', row.model, 'entityId'),
          entityDesc: text(lk.models, 'id', row.model, 'entityDesc'),
          currencyId: text(lk.models, 'id', row.model, 'currencyId'),
          currencyDesc: text(lk.models, 'id', row.model, 'currencyDesc'),
          modelDesc: text(lk.models, 'id', row.model, 'text'),
          payTermsText: text(lk.payTerms, 'code', row.payTerms, 'text')
        };
      }
    }
  }
};
