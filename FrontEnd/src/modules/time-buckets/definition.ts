// FS00 Time Buckets (ALM 1 and ALM 2/3 buckets), ported from ALM src/pages/time-buckets/rules.js and
// engine/timebuckets.py. Column order follows the legacy grids, so spreadsheets pasted there paste here too.
import { col, stampCols, str, zeroBlank } from '@/lib/grid/grid';
import type { Column, GridColumn, Option, Row, StampFields, TabDef } from '@/lib/grid/types';
import type { ModuleDef } from '../types';

const STAMP: StampFields = ['enteredBy', 'enteredOn', 'entryTime', 'changedBy', 'changedOn', 'changedTime'];
const NUMBERS: Record<string, number> = { fromNo: 5, toNo: 5, rbiNo: 3, fromDays: 5, toDays: 5 };
const LABELS: Record<string, string> = {
  description: 'Description', xbrlCode: 'XBRL Code', fromNo: 'From No', fromFreq: 'From Freq', toNo: 'To No',
  toFreq: 'To Freq', rbiNo: 'RBI No', fromDays: 'From Days', toDays: 'To Days'
};
type FreqField = 'fromFreq' | 'toFreq';

export interface TimeBucketLookups {
  freq: Record<FreqField, Option[]>;
  freqText: (field: FreqField, value: string) => string;
}

/** Frequencies of both tables are codes of SAP domain /FS00/ALMDM0001 (01 Day(s), 02 Month(s), 03 Year(s)). */
export function lookups(raw: Record<string, Row[]> | undefined): TimeBucketLookups {
  const domain = raw?.freqDomain ?? [];
  const pick = (name: string): Option[] => domain.filter(d => str(d.field) === name).map(d => ({ value: str(d.value), label: str(d.text), desc: str(d.text) }));
  const freq = { fromFreq: pick('ZFR_TP'), toFreq: pick('ZTO_TP') };
  return { freq, freqText: (field, value) => freq[field].find(o => o.value === str(value))?.label || str(value) };
}

function buckets({ id, label, rbi }: { id: string; label: string; rbi: boolean }): TabDef<TimeBucketLookups> {
  const fields = ['description', 'xbrlCode', 'fromNo', 'fromFreq', 'toNo', 'toFreq', ...(rbi ? ['rbiNo'] : []), 'fromDays', 'toDays'];
  const required = fields.filter(f => f !== 'fromDays' && f !== 'toDays');
  const range = (which: 'from' | 'to'): Column => col(which, which === 'from' ? 'From' : 'To', {
    text: r => `${str(r[`${which}No`])} ${str(r[`${which}FreqText`] || r[`${which}Freq`])}`.trim(),
    sort: r => Number(r[`${which}No`]) || 0
  });
  const number = (field: string, heading: string): GridColumn<TimeBucketLookups> => ({ field, label: heading, type: 'integer', max: NUMBERS[field] });
  const freqCol = (field: FreqField, heading: string): GridColumn<TimeBucketLookups> => ({ field, label: heading, type: 'select', options: lk => lk.freq[field], width: 130 });
  return {
    id, label, title: label, noun: [label.replace(/s$/, ''), label], editable: true,
    keys: ['bucket'], defaultSort: { col: 'bucket', dir: 1 },
    columns: [
      col('bucket', 'Bucket', { code: true }), col('description', 'Description', { bold: true }), col('xbrlCode', 'XBRL Code'),
      range('from'), range('to'),
      ...(rbi ? [col('rbiNo', 'RBI No', { text: r => zeroBlank(r.rbiNo) })] : []),
      col('fromDays', 'From Days', { text: r => zeroBlank(r.fromDays) }), col('toDays', 'To Days', { text: r => zeroBlank(r.toDays) }),
      ...stampCols(STAMP)
    ],
    search: r => [r.bucket, r.description, r.xbrlCode],
    filters: [{
      id: 'freq', all: 'All Frequency Types',
      options: (_rows, lk) => [...new Map([...lk.freq.fromFreq, ...lk.freq.toFreq].map(o => [o.value, o])).values()],
      match: (r, v) => r.fromFreq === v || r.toFreq === v
    }],
    grid: [
      { field: 'bucket', label: 'Bucket *', type: 'text', max: 10, key: true, mono: true },
      { field: 'description', label: 'Description *', type: 'text', max: 60 },
      { field: 'xbrlCode', label: 'XBRL Code *', type: 'text', max: 40 },
      number('fromNo', 'From No *'), freqCol('fromFreq', 'From Freq *'), number('toNo', 'To No *'), freqCol('toFreq', 'To Freq *'),
      ...(rbi ? [number('rbiNo', 'RBI No *')] : []), number('fromDays', 'From Days'), number('toDays', 'To Days')
    ],
    check: (r, lk) => Object.fromEntries(fields.map(f => {
      if (required.includes(f) && !r[f]) return [f, 'required'];
      if (NUMBERS[f] && r[f] && !/^\d+$/.test(r[f])) return [f, `${LABELS[f]} must be a whole number.`];
      if ((f === 'fromFreq' || f === 'toFreq') && r[f] && !lk.freq[f].some(o => o.value === r[f])) return [f, `${LABELS[f]} '${r[f]}' is not a valid frequency.`];
      return [f, ''];
    }))
  };
}

const BUCKET = ['bucket', 'description', 'xbrlCode', 'fromNo', 'fromFreq', 'toNo', 'toFreq'];

export const timeBuckets: ModuleDef<TimeBucketLookups> = {
  id: 'timebuckets',
  title: 'Time Buckets',
  noun: 'time buckets',
  serviceKey: 'timebuckets',
  storageKey: 'smui-timebuckets-tab',
  blankRows: 3,
  opens: { create: 'popup', open: 'wizard' },
  strict: true,
  tabs: [buckets({ id: 'alm1', label: 'ALM 1 Buckets', rbi: true }), buckets({ id: 'alm2', label: 'ALM 2/3 Buckets', rbi: false })],
  fields: { alm1: [...BUCKET, 'rbiNo', 'fromDays', 'toDays', ...STAMP], alm2: [...BUCKET, 'fromDays', 'toDays', ...STAMP] },
  stamps: STAMP,
  lookups,
  enrich: (_table, row, lk) => ({ ...row, fromFreqText: lk.freqText('fromFreq', row.fromFreq), toFreqText: lk.freqText('toFreq', row.toFreq) })
};
