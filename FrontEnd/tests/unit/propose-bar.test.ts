// The command bar of Propose Tradeflow: BL number ranges, BL date / ETD / ETA, references, a fill target, and
// conditions that stack (one Apply after another) into one set of criteria.
import { describe, expect, it } from 'vitest';
import { describeCriteria, filterBls, mergeCriteria, readConditions, targetOf } from '@/lib/propose/query';

const read = (t: string) => readConditions(t, []);
const bl = (blNo: string, x: Record<string, string> = {}) => ({
  blNo, tfNo: `30${blNo.slice(2)}`, tfDate: '2026-11-07', commodity: 'COFARABICA', quantity: '50000', usdValue: '52500', dealId: '', deletedFlag: '',
  blNumber: `VAR-ARA-${blNo.slice(-4)}`, blDate: '2026-10-15', etd: '2026-10-16', eta: '2026-11-20', contractRef: 'VAR-CTR-ARA', notifyParty: 'TSF Test Bulk', invoiceRef: `VAR-INV-${Number(blNo.slice(-4))}`, ...x
});
const bls = [
  bl('4000001000'), bl('4000001050', { blDate: '2026-11-03', eta: '2026-12-08' }), bl('4000001100', { contractRef: 'CTR-OTHER', notifyParty: 'Olam Viet Nam Ltd' }),
  bl('4000001200', { etd: '2026-11-05', blNumber: 'OTH-0001' })
];
const keep = (t: string) => filterBls(bls, read(t).criteria, []).map(b => b.blNo);

describe('BL number ranges', () => {
  it('exclude a range, inclusive', () => {
    expect(read('exclude BLs 4000001000 to 4000001050').criteria.bl.ranges).toEqual([{ from: '4000001000', to: '4000001050', mode: 'exclude' }]);
    expect(keep('exclude BLs 4000001000 to 4000001050')).toEqual(['4000001100', '4000001200']);
  });
  it('only a range (between … and …), and the BLs typed one by one stay single BLs', () => {
    expect(keep('only BLs between 4000001050 and 4000001100')).toEqual(['4000001050', '4000001100']);
    expect(read('exclude 4000001000 and 4000001050').criteria.bl.exclude).toEqual(['4000001000', '4000001050']);
  });
});

describe('dates by their subject', () => {
  it('BL date, ETD, ETA, and the trade flow date by default', () => {
    expect(read('BL date in October 2026').criteria.bl.blDate).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(read('shipped before 01 Nov 2026').criteria.bl.etd).toEqual({ to: '2026-11-01', toStrict: true });
    expect(read('ETA after 30 Nov 2026').criteria.bl.eta).toEqual({ from: '2026-11-30', fromStrict: true });
    expect(read('dated 06/11/2026').criteria.bl.tfDate).toEqual({ from: '2026-11-06', to: '2026-11-06', fromStrict: false, toStrict: false });
  });
  it('filters on the right date', () => {
    expect(keep('BL date in October 2026')).toEqual(['4000001000', '4000001100', '4000001200']);
    expect(keep('ETA after 30 Nov 2026')).toEqual(['4000001050']);
    expect(keep('shipped before 01 Nov 2026')).toEqual(['4000001000', '4000001050', '4000001100']);
  });
});

describe('contract, notify party, invoice and BL reference', () => {
  it('only a contract; exclude a notify party (any part of the name)', () => {
    expect(keep('only contract VAR-CTR-ARA')).toEqual(['4000001000', '4000001050', '4000001200']);
    expect(keep('exclude notify party Olam')).toEqual(['4000001000', '4000001050', '4000001200']);
  });
  it('a BL reference with * for any characters, and invoices as a list', () => {
    expect(keep('BL reference VAR-ARA-*')).toEqual(['4000001000', '4000001050', '4000001100']);
    expect(keep('exclude invoice VAR-INV-1000, VAR-INV-1050')).toEqual(['4000001100', '4000001200']);
  });
  it('is described in plain words', () => {
    expect(read('exclude notify party Olam, only contract VAR-CTR-ARA').applied).toEqual(['exclude notify party Olam', 'only contract VAR-CTR-ARA']);
  });
});

describe('fill only part of what is left', () => {
  it('a share or an amount, never more than what is left; a number of BLs is not an amount', () => {
    expect(read('fill 50%').criteria.target).toEqual({ pct: 50 });
    expect(read('propose 1 Cr only').criteria.target).toEqual({ usd: 10000000 });
    expect(read('propose 300 BLs').criteria.target).toBeUndefined();
    expect(targetOf('24000000.00', read('fill 50%').criteria)).toBe('12000000.00');
    expect(targetOf('5000000.00', read('propose 1 Cr').criteria)).toBe('5000000.00');
  });
});

describe('conditions stack', () => {
  it('lists join, a later amount or target replaces an earlier one', () => {
    const c = mergeCriteria([read('exclude BL 4000001000').criteria, read('exclude BL 4000001050, fill 50%').criteria, read('only contract VAR-CTR-ARA').criteria, read('fill 40%').criteria]);
    expect(c.bl.exclude).toEqual(['4000001000', '4000001050']);
    expect(c.target).toEqual({ pct: 40 });
    expect(filterBls(bls, c, []).map(b => b.blNo)).toEqual(['4000001200']);
    expect(describeCriteria(c)).toEqual(['exclude BL 4000001000, 4000001050', 'only contract VAR-CTR-ARA', 'fill 40% of what is left']);
  });
});

describe('plain words a user may type', () => {
  const known = { notifyParty: ['Northwind Beverages', 'Blue Harbor Foods Ltd'], contractRef: ['ARA-CTR-2601'] };
  const say = (t: string) => readConditions(t, [], { known, today: '2026-11-07' });
  it('negatives, names alone and relative dates', () => {
    expect(say("don't use BL 4000001000").criteria.bl.exclude).toEqual(['4000001000']);
    expect(say('skip Northwind').criteria.bl.text).toEqual([{ field: 'notifyParty', mode: 'exclude', values: ['Northwind Beverages'] }]);
    expect(say('only Blue Harbor Foods Ltd').criteria.bl.text).toEqual([{ field: 'notifyParty', mode: 'only', values: ['Blue Harbor Foods Ltd'] }]);
    expect(say('ARA-CTR-2601 only').criteria.bl.text?.[0]).toMatchObject({ field: 'contractRef', values: ['ARA-CTR-2601'] });
    expect(say('BLs older than 60 days').criteria.bl.blDate).toEqual({ to: '2026-09-08', toStrict: true });
    expect(say('BLs from the last 30 days').criteria.bl.blDate).toEqual({ from: '2026-10-08', fromStrict: false });
    expect(say('BLs older than 15 Oct 2026').criteria.bl.blDate).toEqual({ to: '2026-10-15', toStrict: true });
    expect(say('BL date from August to September').criteria.bl.blDate).toEqual({ from: '2026-08-01', to: '2026-09-30' });
    expect(say('ignore Northwind, BLs above 60K').notUnderstood).toEqual([]);
  });
});
