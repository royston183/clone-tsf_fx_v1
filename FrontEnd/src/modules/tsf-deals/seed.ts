// Sample TSF deal lines (UI approval). The first four follow the reference's legacy demo page; the rest are generated
// deterministically around the current month so the default selection (this month) always shows rows.
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../types';

const STATUS: Record<string, string> = { '01': 'FO Create', '02': 'Deleted / Reversed', '03': 'Released to MO', '07': 'MO Match & Release', '16': 'Released to BO', '30': 'Settled' };
const MODELS: Record<string, string> = { M032: 'INR Paired Forward', M033: 'INR-INR-INR Forward', M037: 'INR NDF', M041: 'Barley Forward' };
const TRADERS: Record<string, string> = { C27: 'Akshay Mohnot', NID: 'Nidhi S', C31: 'Wei Ling Tan', C41: 'Omar Haddad' };
const PARTNERS = ['DBS Bank Ltd', 'Standard Chartered', 'Emirates NBD', 'Citibank N.A.', 'HSBC'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function line(p: Partial<Row> & { rfha: string }): Row {
  const status = p.txnStatus ?? '03';
  return {
    companyCode: 'SG03', dealType: 'D1', productType: 'FX Forward', bs1: 'Buy', curr1: 'USD', bs2: 'Sell', curr2: 'SGD', spotRate: '', swapRate: '', allInRate: '',
    dealPl: '', plCurr: 'USD', dealPlLocal: '', plLocalCurr: 'SGD', model: 'M032', subType: 'FX1', trader: 'C31', extRef: '', intRef: '', mcRef: '',
    foRemark: '', moRemark: '', ndfFixDate: '', ndfRef: '', ndfRate: '', cashAmount: '', cashCurr: '', reversed: '',
    ...p,
    txnStatus: status, statusText: STATUS[status] ?? status,
    modelText: MODELS[String(p.model ?? 'M032')] ?? '', traderName: TRADERS[String(p.trader ?? 'C31')] ?? ''
  } as Row;
}

export function tsfDealsSeed(): ModuleSeed {
  const now = new Date();
  const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return iso(d); };
  const deals: Row[] = [
    line({ rfha: '6000001241', dealId: '7000000048', partner: 'DBS Bank Ltd', blotterDate: day(-1), tradeDate: day(-4), valueDate: day(56), amount1: '1250000.00', amount2: '1618750.00', spotRate: '1.2867', swapRate: '0.0083', allInRate: '1.2950', dealPl: '18450.20', dealPlLocal: '23893.01', txnStatus: '03', mcRef: '2000002728', extRef: 'DBS-FX-77812', intRef: 'OLAM-1241' }),
    line({ rfha: '6000001242', dealId: '7000000049', dealType: 'D2', productType: 'FX Spot', partner: 'Standard Chartered', blotterDate: day(-1), tradeDate: day(-1), valueDate: day(1), bs1: 'Sell', bs2: 'Buy', amount1: '850000.00', amount2: '1101175.00', spotRate: '1.2955', swapRate: '0', allInRate: '1.2955', txnStatus: '07', mcRef: '2000002728' }),
    line({ rfha: '6000001233', companyCode: 'AE11', dealId: '7000000036', productType: 'NDF', partner: 'Emirates NBD', blotterDate: day(-3), tradeDate: day(-5), valueDate: day(40), curr2: 'INR', amount1: '2000000.00', amount2: '177600000.00', spotRate: '88.4500', swapRate: '0.3500', allInRate: '88.8000', model: 'M037', txnStatus: '16', trader: 'C41', plLocalCurr: 'AED', ndfFixDate: day(38), ndfRef: 'RBI-USDINR', mcRef: '2000002724' }),
    line({ rfha: '6000001217', dealId: '7000000018', partner: 'Citibank N.A.', blotterDate: day(-6), tradeDate: day(-6), valueDate: day(30), curr1: 'EUR', curr2: 'USD', amount1: '720000.00', amount2: '837360.00', spotRate: '1.1630', swapRate: '0', allInRate: '1.1630', txnStatus: '02', reversed: 'X', plCurr: 'USD', plLocalCurr: 'USD' })
  ];
  for (let i = 0; i < 26; i++) {
    const back = -(i % 20) - 1;
    const usd = (5 + (i * 37) % 95) * 25000;
    const inr = i % 3 === 0;
    const rate = inr ? 83.1 + (i % 7) * 0.11 : 1.29 + (i % 5) * 0.002;
    const status = ['03', '07', '07', '16', '30', '01'][i % 6];
    deals.push(line({
      rfha: String(6000001300 + i), companyCode: inr ? 'AE13' : 'SG03', dealId: `70000001${pad(i)}`, dealType: i % 2 ? 'D2' : 'D1',
      productType: i % 4 === 0 ? 'FX Spot' : 'FX Forward', partner: PARTNERS[i % PARTNERS.length], blotterDate: day(back), tradeDate: day(back - 1), valueDate: day(back + 30 + (i % 4) * 15),
      bs1: i % 2 ? 'Sell' : 'Buy', bs2: i % 2 ? 'Buy' : 'Sell', curr2: inr ? 'INR' : 'SGD', amount1: `${usd}.00`, amount2: (usd * rate).toFixed(2),
      spotRate: (rate - 0.004).toFixed(4), swapRate: '0.0040', allInRate: rate.toFixed(4), dealPl: i % 2 ? (((i * 131) % 900) * 10.5).toFixed(2) : '',
      plLocalCurr: inr ? 'AED' : 'SGD', model: inr ? 'M033' : 'M041', trader: ['C27', 'NID', 'C31', 'C41'][i % 4], txnStatus: status,
      mcRef: inr ? '2000000028' : '2000002724', foRemark: i === 5 ? 'Rolled from 7000000003' : '', moRemark: i === 8 ? 'Rate mismatch with bank confirmation' : ''
    }));
  }
  return { tables: { deals } };
}
