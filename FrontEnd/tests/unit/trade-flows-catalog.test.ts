import { describe, expect, it } from 'vitest';
import { applicationPages } from '@/config/catalog';

describe('Master Data and Trade Flows pages', () => {
  it('follow Overview on the rail', () => {
    expect(applicationPages.slice(0, 3).map(p => p.id)).toEqual(['overview', 'master-data', 'trade-flows']);
  });
  it('have the requested tiles in order', () => {
    const kids = (id: string) => applicationPages.find(p => p.id === id)?.children?.map(c => c.title);
    expect(kids('master-data')).toEqual(['Maintain Commodity']);
    expect(kids('trade-flows')).toEqual(['Tradeflows Upload', 'Tradeflows List', 'Update Price', 'Manage Tradeflows']);
  });
  it('keeps Manage Tradeflows as a placeholder', () => {
    const tf = applicationPages.find(p => p.id === 'trade-flows');
    expect(tf?.children?.find(c => c.id === 'manage-tradeflows')?.page).toBe('planned');
  });
});
