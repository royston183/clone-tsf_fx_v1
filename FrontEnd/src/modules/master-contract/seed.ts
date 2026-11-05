// Sample master contracts (UI approval). The first rows follow the reference's legacy page; the rest are generated
// deterministically (Park–Miller, no Math.random) so every machine shows the same list.
import type { Row } from '@/lib/grid/types';
import type { ModuleSeed } from '../types';
import { COMMODITIES, MC_STATUS, MODELS, ORIGINS, PAY_TERMS } from './lookups';

const pad = (n: number) => String(n).padStart(2, '0');
const day = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const FIXED: Row[] = [
  { mcNo: '2000002728', status: '04', origin: 'OSIPL', model: 'M032', commodity: 'C105', mcDate: '2026-08-22', amountUsd: '100000.00', currency: 'USD', exRate: '95.7120', mcRef: 'MC/OSIPL/2026/728', tolerance: '5.000', shipStart: '2026-08-22', shipEnd: '2026-09-15', payTerms: 'P01', payDate: '2026-09-15', pos: 'SGSIN', pod: 'INMUN', linkedDeal: 'DL26000101', comDescLong: 'Yellow corn, feed grade' },
  { mcNo: '2000002724', status: '03', origin: 'OSIPL', model: 'M041', commodity: 'C104', mcDate: '2026-09-21', amountUsd: '48602.00', currency: 'USD', exRate: '8.0000', mcRef: 'MC/OSIPL/2026/724', tolerance: '5.000', shipStart: '2026-11-01', shipEnd: '2027-01-31', payTerms: 'P02', payDate: '', pos: 'AEJEA', pod: 'INNSA', linkedDeal: 'DL26000142', comDescLong: 'Malting barley' },
  { mcNo: '2000002725', status: '02', origin: 'OTL', model: 'M034', commodity: 'C112', mcDate: '2026-10-02', amountUsd: '22889.00', currency: 'USD', exRate: '6.0000', mcRef: 'MC/OTL/2026/725', tolerance: '5.000', shipStart: '2026-11-15', shipEnd: '2026-12-31', payTerms: 'P03', payDate: '', pos: 'SGSIN', pod: 'THBKK', linkedDeal: '', comDescLong: 'Crude soybean oil' },
  { mcNo: '2000002715', status: '11', origin: 'OVL', model: 'M041', commodity: 'C126', mcDate: '2026-10-12', amountUsd: '10904.00', currency: 'USD', exRate: '25350.0000', mcRef: 'MC/OVL/2026/715', tolerance: '5.000', shipStart: '2026-11-20', shipEnd: '2027-01-15', payTerms: 'P05', payDate: '', pos: 'SGSIN', pod: 'SGSIN', linkedDeal: '', comDescLong: 'Urea fertilizer' },
  { mcNo: '2000002731', status: '01', origin: 'OSIPL', model: 'M033', commodity: 'C110', mcDate: '2026-11-02', amountUsd: '3000000.00', currency: 'USD', exRate: '83.2000', mcRef: 'MC/OSIPL/2026/731', tolerance: '5.000', shipStart: '2026-11-10', shipEnd: '2027-02-28', payTerms: 'P01', payDate: '2027-02-28', pos: 'BRSSZ', pod: 'INMUN', linkedDeal: '', comDescLong: 'Milling wheat 12.5% protein' }
];

export function masterContractSeed(count = 40): ModuleSeed {
  let s = 20261104;
  const next = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(next() * xs.length)];
  const statuses = ['01', '02', '03', '03', '04', '04', '04', '09', '11', '13'];
  const rows: Row[] = [...FIXED];
  for (let i = 0; i < count; i++) {
    const n = 2000002600 + i;
    const origin = pick(ORIGINS), model = pick(MODELS), commodity = pick(COMMODITIES), status = pick(statuses);
    const m = 1 + (i % 10), d = 1 + (i % 27);
    const amount = (Math.floor(next() * 480) + 20) * 5000;
    const rate = origin.currency === 'INR' ? 83 + next() * 13 : origin.currency === 'THB' ? 35 + next() * 2 : origin.currency === 'VND' ? 25000 + next() * 400 : 1;
    rows.push({
      mcNo: String(n), status, origin: origin.value, model: model.id, commodity: commodity.value, mcDate: day(2026, m, d),
      amountUsd: `${amount}.00`, currency: 'USD', exRate: rate.toFixed(4), mcRef: `MC/${origin.value}/2026/${String(n).slice(-3)}`, tolerance: '5.000',
      shipStart: day(2026, Math.min(12, m + 1), d), shipEnd: day(2027, Math.min(12, m + 2), d), payTerms: 'P01', payDate: '', pos: 'SGSIN', pod: 'INMUN',
      linkedDeal: status === '04' ? `DL26000${String(200 + i)}` : '', comDescLong: ''
    });
  }
  return {
    tables: { contracts: rows },
    // The value lists in the shape the middleware's masters are read (rest.ts lookups).
    lookups: {
      origins: ORIGINS.map(o => ({ entity: o.value, company: o.company, name: o.label.split(' · ')[2] ?? '', currency: o.currency })),
      commodities: COMMODITIES.map(c => ({ code: c.value, text: c.label.split(' - ')[1] ?? c.label })),
      models: MODELS.map(m => ({ id: m.id, text: m.text, entityId: '', entityDesc: m.entityString, currencyId: '', currencyDesc: m.currencyString })),
      payTerms: PAY_TERMS.map(p => ({ code: p.value, text: p.label.split(' - ')[1] ?? p.label })),
      statuses: MC_STATUS.map(s => ({ code: s.value, text: s.label }))
    }
  };
}
