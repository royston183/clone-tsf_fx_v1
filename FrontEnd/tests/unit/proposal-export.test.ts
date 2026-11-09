// Propose Tradeflow: a proposal exported to Excel carries the deal, the proposal's figures and every BL with a total.
import { describe, expect, it } from 'vitest';
import { proposalFileName, proposalSheet } from '@/pages/propose-tradeflows/proposal-export';

const deal = { dealId: '7000000080', dealDesc: 'Nidhi S_OSIPL_2026', tsfCommodity: 'C130', tsfCommodityText: 'Cocoa Butter', amount: '20182000', currency: 'USD', usd: '20182000.00', assignedUsd: '0.00', remainingUsd: '20182000.00' };
const bls = [
  { blNo: '4000000870', blNumber: 'VAR-BUT-0056', blDate: '2026-09-07', tfNo: '3000000871', tfDate: '2026-09-07', contractRef: 'BUT-CTR-2601', notifyParty: 'Olam', quantity: '85570.000', usdValue: '84714.30' },
  { blNo: '4000003738', blNumber: 'VAR-BUT-0773', blDate: '2026-09-04', tfNo: '3000003739', tfDate: '2026-09-04', contractRef: 'BUT-CTR-2602', notifyParty: 'Olam', quantity: '85392.586', usdValue: '84538.66' }
];
const at = new Date(2026, 10, 8);

describe('proposal export', () => {
  const rows = proposalSheet({ rank: 3, way: 'Oldest BLs', deal, totalUsd: '169252.96', afterUsd: '20012747.04', match: '99.0%', diffPct: -0.99, bls, dropped: new Set(['4000003738']), unit: 'LBS', exportedAt: at });
  const find = (label: string) => rows.find(r => r[0] === label);
  it('starts with the deal and the proposal figures', () => {
    expect(rows[0]).toEqual(['Proposal 3 for Deal ID 7000000080']);
    expect(find('Deal ID')).toEqual(['Deal ID', '7000000080']);
    expect(find('Commodity')).toEqual(['Commodity', 'C130 Cocoa Butter']);
    expect(find('Deal amount')).toEqual(['Deal amount', { number: '20182000' }, 'USD']);
    expect(find('Deal amount (USD)')).toEqual(['Deal amount (USD)', { number: '20182000.00' }]);
    expect(find('Unassigned after (USD)')).toEqual(['Unassigned after (USD)', { number: '20012747.04' }]);
    expect(find('Match')).toEqual(['Match', '99.0% (-0.99%)']);
    expect(find('BLs')).toEqual(['BLs', '2', 'Kept', '1']);
    expect(find('Exported')).toEqual(['Exported', '08-11-2026']);
  });
  it('lists every BL, numbered, with whether it is kept, and a total', () => {
    const head = rows.findIndex(r => r[0] === '#');
    expect(rows[head + 1]).toEqual(['1', '4000000870', 'VAR-BUT-0056', '07-09-2026', '3000000871', '07-09-2026', 'BUT-CTR-2601', 'Olam', { number: '85570.000' }, { number: '84714.30' }, 'Yes']);
    expect(rows[head + 2].at(-1)).toBe('No');
    expect(rows.at(-1)).toEqual(['Total', '2 BLs', '', '', '', '', '', '', { number: '170962.586' }, { number: '169252.96' }, '']);
  });
  it('writes the capped part of a capped BL', () => {
    const capped = proposalSheet({ rank: 1, way: '', deal, totalUsd: '100000.00', afterUsd: '0.00', match: '100.0%', diffPct: 0, bls, dropped: new Set(), unit: 'LBS', exportedAt: at, cap: { blNo: '4000003738', usd: '15285.70' } });
    expect(capped[capped.findIndex(r => r[0] === '#') + 2][9]).toEqual({ number: '15285.70' });
  });
  it('names the file after the proposal, the deal and the day', () => {
    expect(proposalFileName(3, '7000000080', at)).toBe('Proposal-3-7000000080-20261108.xlsx');
  });
});
