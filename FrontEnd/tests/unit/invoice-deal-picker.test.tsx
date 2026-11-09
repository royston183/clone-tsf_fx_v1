// Invoice Finalisation Blotter: the Deal ID picker that replaced the browser's datalist.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DealPicker, filterDeals } from '@/ref/features/mo-generate-invoices-deal-id/DealPicker';
import type { DealListRow } from '@/ref/features/mo-generate-invoices-deal-id/types';

const row = (dealId: string, entityString: string, statusLabel: string): DealListRow => ({ dealId, dealRef: '', modelId: '', entityString, status: statusLabel.slice(0, 2), statusLabel, mcRef: '2000000026', trader: 'C' });
const deals = [row('7000000083', 'OGA-DMCC-OSIPL', '02 - MO: FX Deals & MC Assignment Confirmed'), row('7000000079', 'OGA-OSIPL-DMCC', '04 - BL Assigned to Deal ID for Invoicing'), row('7000000108', 'OGA-DMCC-OSIPL', '01 - FO: FX Deals Created')];

describe('Deal ID picker', () => {
  it('filters by Deal ID, entity or status, IDs starting with the text first', () => {
    expect(filterDeals(deals, '').map(d => d.dealId)).toEqual(['7000000083', '7000000079', '7000000108']);
    expect(filterDeals(deals, '04 - BL').map(d => d.dealId)).toEqual(['7000000079']);
    expect(filterDeals(deals, 'osipl-dmcc').map(d => d.dealId)).toEqual(['7000000079']);
    expect(filterDeals(deals, '700000010').map(d => d.dealId)).toEqual(['7000000108']);
    expect(filterDeals(deals, '08').map(d => d.dealId)).toEqual(['7000000083', '7000000108']);
    expect(filterDeals(deals, 'zzz')).toEqual([]);
  });
  it('is a closed combobox until the box is used', () => {
    const html = renderToStaticMarkup(<DealPicker deals={deals} value="" onChange={() => {}} onPick={() => {}} onEnter={() => {}} />);
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('<datalist');
  });
});
