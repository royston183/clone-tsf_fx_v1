import { describe, expect, it } from 'vitest';
import { favouriteOptions, matchesQuery } from '@/pages/fx-blotter/traders';

const master = [
  { code: 'C22', text: 'Amey Tari' }, { code: 'C28', text: 'Nidhi Singh' }, { code: 'C29', text: 'Nidhi Singh' }, { code: 'T04', text: 'Anil Jena' },
  { code: 'T05', text: 'Mayank Jain' }, { code: 'V01', text: 'Aparna Vinodan' }, { code: 'V02', text: 'Lakshminarayanan B' }, { code: 'V03', text: 'Sibte Afzal' },
  { code: 'V04', text: 'Rahul K' }, { code: 'V05', text: 'Rahul Kumar Other' }, { code: 'X01', text: 'Someone Else' }
];

describe('favourite traders of the blotter', () => {
  const f = favouriteOptions(master);
  it('lists the desk\'s eight by short name, resolved to SAP codes that exist in the master', () => {
    expect(f.map(x => x.label)).toEqual(['Nidhi S · C28', 'Nidhi S · C29', 'Aparna', 'Lakshmi', 'Sibte', 'Rahul K', 'Amey T', 'Anil Jena', 'Mayank Jain']);
    for (const x of f) expect(master.some(m => m.code === x.code)).toBe(true);
  });
  it('lists a person with several SAP codes once per code, and does not guess one', () => {
    expect(f.filter(x => x.label.startsWith('Nidhi S')).map(x => x.code)).toEqual(['C28', 'C29']);
  });
  it('does not mix up a similar name (Rahul K is not Rahul Kumar Other)', () => {
    expect(f.find(x => x.label === 'Rahul K')?.code).toBe('V04');
  });
  it('makes up no trader that the master does not hold', () => {
    expect(favouriteOptions([{ code: 'X01', text: 'Someone Else' }])).toEqual([]);
  });
  it('searches by code or name', () => {
    expect(matchesQuery('amey', 'C22', 'Amey Tari')).toBe(true);
    expect(matchesQuery('c22', 'C22', 'Amey Tari')).toBe(true);
    expect(matchesQuery('zzz', 'C22', 'Amey Tari')).toBe(false);
    expect(matchesQuery('', 'anything')).toBe(true);
  });
});

describe('favourites with a trader repeated in several groups', () => {
  it('lists each SAP code once', () => {
    const dup = [{ code: 'V01', text: 'Aparna Vinodan' }, { code: 'V01', text: 'Aparna Vinodan' }, { code: 'T04', text: 'Anil Jena' }, { code: 'T04', text: 'Anil Jena' }];
    expect(favouriteOptions(dup)).toEqual([{ code: 'V01', label: 'Aparna' }, { code: 'T04', label: 'Anil Jena' }]);
  });
});
