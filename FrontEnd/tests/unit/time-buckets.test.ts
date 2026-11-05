import { describe, expect, it } from 'vitest';
import { lookups, timeBuckets } from '@/modules/time-buckets/definition';
import { MODULES } from '@/modules/registry';
import seed from '@/modules/time-buckets/seed.json';

const lk = lookups(seed.lookups);
const [alm1, alm2] = timeBuckets.tabs;
const row = { bucket: 'B09', description: 'D', xbrlCode: 'X', fromNo: '1', fromFreq: '01', toNo: '7', toFreq: '02', rbiNo: '3', fromDays: '', toDays: '' };

describe('Time Buckets module', () => {
  it('is registered', () => expect(MODULES.timebuckets).toBe(timeBuckets));
  it('reads the frequency domain', () => {
    expect(lk.freq.fromFreq.map(o => o.label)).toEqual(['Day(s)', 'Month(s)', 'Year(s)']);
    expect(lk.freqText('toFreq', '02')).toBe('Month(s)');
    expect(lk.freqText('toFreq', '99')).toBe('99');
  });
  it('has RBI No on ALM 1 only', () => {
    expect(alm1.grid.map(c => c.field)).toContain('rbiNo');
    expect(alm2.grid.map(c => c.field)).not.toContain('rbiNo');
    expect(alm1.noun).toEqual(['ALM 1 Bucket', 'ALM 1 Buckets']);
    expect(timeBuckets.fields.alm1).toEqual(['bucket', 'description', 'xbrlCode', 'fromNo', 'fromFreq', 'toNo', 'toFreq', 'rbiNo', 'fromDays', 'toDays', 'enteredBy', 'enteredOn', 'entryTime', 'changedBy', 'changedOn', 'changedTime']);
  });
  it('checks required fields, numbers and frequencies', () => {
    expect(Object.values(alm1.check(row, lk, 'add')).filter(Boolean)).toEqual([]);
    expect(alm1.check({ ...row, description: '', fromNo: '1a', toFreq: '09', rbiNo: '' }, lk, 'add')).toMatchObject({
      description: 'required', fromNo: 'From No must be a whole number.', toFreq: "To Freq '09' is not a valid frequency.", rbiNo: 'required'
    });
    expect(alm2.check({ ...row, rbiNo: '' }, lk, 'add').rbiNo).toBeUndefined();
  });
  it('shows ranges with frequency texts after enrichment', () => {
    const enriched = timeBuckets.enrich?.('alm1', seed.tables.alm1[0], lk);
    expect(enriched?.fromFreqText).toBe('Day(s)');
    expect(alm1.columns.find(c => c.field === 'from')?.text(enriched ?? {})).toBe('1 Day(s)');
  });
});
