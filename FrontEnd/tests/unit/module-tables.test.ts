import { describe, expect, it } from 'vitest';
import { isTableModule, kindOf } from '@/modules/registry';
import { moduleTables } from '@/modules/tables';
import { timeBuckets } from '@/modules/time-buckets/definition';
import type { DashboardModuleDef, ObjectModuleDef, ReportModuleDef } from '@/modules/types';

const deals: ObjectModuleDef<unknown> = {
  kind: 'object', id: 'x', title: 'X', noun: ['Deal', 'Deals'], serviceKey: 's', storageKey: 'k', lookups: () => ({}),
  opens: { create: 'popup', open: 'popup' },
  list: { entity: 'deals', keys: ['deal'], columns: [], fields: [{ field: 'deal', label: 'Deal', type: 'code' }, { field: 'status', label: 'Status' }], defaultSort: { field: 'deal', dir: 1 } },
  header: [{ field: 'deal', label: 'Deal', type: 'code', key: true }, { field: 'start', label: 'Validity', type: 'dateRange', toField: 'end' }],
  tabs: [
    { kind: 'fields', id: 'basic', label: 'Basic', groups: [{ title: 'Terms', fields: [{ field: 'rate', label: 'Rate', type: 'decimal', scale: 4 }, { field: 'shown', label: 'Shown', type: 'display', computed: () => '' }] }] },
    { kind: 'items', id: 'flows', label: 'Flows', table: 'flows', keys: ['deal', 'seq'], grid: [{ field: 'seq', label: 'No.', type: 'integer', key: true }, { field: 'amount', label: 'Amount', type: 'amount' }], columns: [] }
  ]
};

describe('moduleTables', () => {
  it('lists the tables of a table module', () => {
    const t = moduleTables(timeBuckets);
    expect(Object.keys(t)).toEqual(['alm1', 'alm2']);
    expect(t.alm1).toMatchObject({ keys: ['bucket'], large: false });
    expect(t.alm1.fields).toContain('enteredBy');
  });
  it('lists the header and item tables of an object module', () => {
    const t = moduleTables(deals);
    expect(t.deals.fields).toEqual(['deal', 'status', 'start', 'end', 'rate']);
    expect(t.flows).toMatchObject({ keys: ['deal', 'seq'], fields: ['deal', 'seq', 'amount'] });
  });
  it('tells the kinds apart', () => {
    expect(kindOf(timeBuckets)).toBe('table');
    expect(isTableModule(timeBuckets)).toBe(true);
    expect(kindOf(deals)).toBe('object');
    expect(isTableModule(deals)).toBe(false);
  });
});

const statement: ReportModuleDef<unknown> = {
  kind: 'report', id: 'r', title: 'R', serviceKey: 's', storageKey: 'k', lookups: () => ({}),
  breakdownOpens: 'popup',
  selection: [{ field: 'company', label: 'Company Code *', type: 'code', max: 4, required: true }, { field: 'month', label: 'Period *', type: 'period', yearField: 'year', required: true }],
  report: {
    variant: 'formatted', entity: 'statement', idField: 'id', orderBy: 'seq', parent: { by: 'prefix', separator: ':' }, style: () => 'normal',
    columns: [{ id: 'name', label: 'Group Name', type: 'text' }, { id: 'b1', label: '1–7 days', type: 'amount' }, { id: 'total', label: 'Total', type: 'amount' }],
    fields: ['rowStyle']
  }
};
const board: DashboardModuleDef<unknown> = { kind: 'dashboard', id: 'd', title: 'D', serviceKey: 's', storageKey: 'k', lookups: () => ({}), selection: [], sections: [{ kind: 'tiles', id: 'kpis' }] };

describe('moduleTables of reports and dashboards', () => {
  it('lists the report entity: selection, order, id, columns, then the extra fields', () => {
    const t = moduleTables(statement);
    expect(Object.keys(t)).toEqual(['statement']);
    expect(t.statement.keys).toEqual(['seq']);
    expect(t.statement.fields).toEqual(['company', 'month', 'year', 'seq', 'id', 'name', 'b1', 'total', 'rowStyle']);
    expect(kindOf(statement)).toBe('report');
    expect(isTableModule(statement)).toBe(false);
  });
  it('gives a dashboard no tables of its own', () => {
    expect(moduleTables(board)).toEqual({});
    expect(kindOf(board)).toBe('dashboard');
  });
});
