import { describe, expect, it } from 'vitest';
import type { AnyField } from '@/lib/fields';
import type { AnyModuleDef } from '@/modules/types';
import { SERVER_MODULES, type ModuleData } from '@/modules/server-registry';
import { moduleSchema, tableName, wantedSchema, type TableSpec } from '../../src/schema/wanted';

const col = (t: TableSpec, name: string) => t.columns.find(c => c.name === name);
const ID: AnyField = { field: 'id', label: 'Id', type: 'code', max: 4, key: true };

/** A one-table module on the application's own data with the given grid fields. */
function tableModule(id: string, grid: AnyField[], extra: Record<string, unknown> = {}): ModuleData {
  const def = {
    id, title: id, noun: 'rows', serviceKey: 'x', storageKey: id, blankRows: 1, strict: false, lookups: () => ({}),
    tabs: [{ id: 'rows', label: 'Rows', keys: ['id'], grid, columns: [] }], fields: { rows: grid.map(g => g.field) }, ...extra
  } as unknown as AnyModuleDef;
  return { def, contract: {} as ModuleData['contract'], seed: { tables: {} }, source: 'app' };
}
const one = (grid: AnyField[], extra?: Record<string, unknown>, warnings?: string[]) => moduleSchema('m', tableModule('m', grid, extra), warnings)[0];

describe('tableName', () => {
  it('names tables per module and entity', () => {
    expect(tableName('sample-deals', 'deals')).toBe('sample_deals__deals');
    expect(tableName('my-app', 'dealFlows')).toBe('my_app__deal_flows');
  });
});

describe('moduleSchema', () => {
  it('builds the Deals header and flows tables with typed columns and keys', () => {
    const [deals, flows] = moduleSchema('sample-deals', SERVER_MODULES['sample-deals']);
    expect(deals.name).toBe('sample_deals__deals');
    expect(deals.primaryKey).toEqual(['deal']);
    expect(col(deals, 'deal')).toMatchObject({ type: 'VARCHAR(10)', notNull: true, nocase: true });
    expect(col(deals, 'amount')).toMatchObject({ type: 'DECIMAL(15,2)', kind: 'decimal', scale: 2, notNull: false });
    expect(col(deals, 'etag')).toMatchObject({ type: 'VARCHAR(64)' });
    expect(deals.etag).toBe(true);
    expect(flows.primaryKey).toEqual(['deal', 'seq']);
    expect(col(flows, 'seq')).toMatchObject({ type: 'BIGINT', kind: 'integer', nocase: false });
    expect(col(flows, 'payDate')).toMatchObject({ type: 'DATE', kind: 'date' });
    expect(flows.etag).toBe(false);
    expect(col(flows, 'etag')).toBeUndefined();
    expect(flows.indexes).toEqual([{ name: 'ix_sample_deals__flows__deal', columns: ['deal'] }]);
  });

  it('indexes the list filters and sort fields except the first key', () => {
    const warnings: string[] = [];
    const [deals] = moduleSchema('sample-deals', SERVER_MODULES['sample-deals'], warnings);
    // status picks one of fixed options (VARCHAR, indexed); product takes its options from lookups (TEXT, which MySQL cannot index)
    expect(deals.indexes.map(i => i.columns[0]).sort()).toEqual(['amount', 'currency', 'name', 'start', 'status']);
    expect(warnings.filter(w => /is TEXT/.test(w)).length).toBe(1);
    expect(deals.indexes.find(i => i.columns[0] === 'name')?.name).toBe('ix_sample_deals__deals__name');
  });

  it('expands date ranges and takes the header key type for item tables', () => {
    const [deals, flows] = moduleSchema('sample-deals', SERVER_MODULES['sample-deals']);
    expect(col(deals, 'end')).toMatchObject({ type: 'DATE' });
    expect(col(deals, 'rate')).toMatchObject({ type: 'DECIMAL(7,4)', scale: 4 });
    expect(col(flows, 'deal')).toMatchObject({ type: 'VARCHAR(10)', notNull: true });
    expect(col(deals, 'statusText')).toBeUndefined();
  });

  it('types text fields by max and key', () => {
    const t = one([
      { field: 'id', label: 'Id', type: 'text', key: true },
      { field: 'a', label: 'A', type: 'text', max: 40 },
      { field: 'b', label: 'B', type: 'text' },
      { field: 'c', label: 'C', type: 'multiSelect', max: 30, options: [] },
      { field: 'd', label: 'D', type: 'multiSelect', options: [] },
      { field: 'e', label: 'E', type: 'select', options: [{ value: 'O', label: 'Open' }, { value: 'C', label: 'Closed' }] },
      { field: 'f', label: 'F', type: 'segmented', options: [{ value: 'X'.repeat(40), label: 'Long' }] },
      { field: 'g', label: 'G', type: 'multiSelect', options: [{ value: 'O', label: 'Open' }] },
      { field: 'h', label: 'H', type: 'select', options: () => [] }
    ]);
    expect(col(t, 'id')).toMatchObject({ type: 'VARCHAR(255)', notNull: true, nocase: true, kind: 'string' });
    expect(col(t, 'a')).toMatchObject({ type: 'VARCHAR(40)', nocase: false, notNull: false });
    expect(col(t, 'b')).toMatchObject({ type: 'TEXT' });
    expect(col(t, 'c')).toMatchObject({ type: 'VARCHAR(30)' });
    expect(col(t, 'd')).toMatchObject({ type: 'TEXT' });
    // One choice from fixed options: its longest value, at least 32 (a pushed column is never widened); indexable.
    expect(col(t, 'e')).toMatchObject({ type: 'VARCHAR(32)' });
    expect(col(t, 'f')).toMatchObject({ type: 'VARCHAR(40)' });
    // Several values, or options known only at run time: still TEXT.
    expect(col(t, 'g')).toMatchObject({ type: 'TEXT' });
    expect(col(t, 'h')).toMatchObject({ type: 'TEXT' });
  });

  it('types integers, flags and periods', () => {
    const t = one([
      ID,
      { field: 'n', label: 'N', type: 'integer', max: 5 },
      { field: 'z', label: 'Z', type: 'integer', max: 6, keepZeros: true },
      { field: 'f', label: 'F', type: 'flag' },
      { field: 'g', label: 'G', type: 'toggle' },
      { field: 'month', label: 'Period', type: 'period', yearField: 'year' }
    ], { fields: { rows: ['id', 'n', 'z', 'f', 'g', 'month', 'year'] } });
    expect(col(t, 'n')).toMatchObject({ type: 'BIGINT', kind: 'integer' });
    expect(col(t, 'z')).toMatchObject({ type: 'VARCHAR(6)', kind: 'string' });
    expect(col(t, 'f')).toMatchObject({ type: 'CHAR(1)', kind: 'string' });
    expect(col(t, 'g')).toMatchObject({ type: 'CHAR(1)' });
    expect(col(t, 'month')).toMatchObject({ type: 'VARCHAR(32)', kind: 'string' });
    expect(col(t, 'year')).toMatchObject({ type: 'BIGINT', kind: 'integer' });
  });

  it('types the stamp fields of a table module', () => {
    const stamps = ['cby', 'con', 'cat', 'mby', 'mon', 'mat'];
    const t = one([ID], { stamps, fields: { rows: ['id', ...stamps] } });
    expect(stamps.map(n => col(t, n)?.type)).toEqual(['VARCHAR(12)', 'CHAR(8)', 'CHAR(6)', 'VARCHAR(12)', 'CHAR(8)', 'CHAR(6)']);
    expect(col(t, 'cby')).toMatchObject({ kind: 'string', notNull: false });
  });

  it('warns about a field with no definition and types it', () => {
    const warnings: string[] = [];
    const t = one([ID], { fields: { rows: ['id', 'legacy'] } }, warnings);
    expect(col(t, 'legacy')).toMatchObject({ type: 'TEXT' });
    expect(warnings.join('\n')).toMatch(/legacy/);
  });

  it('caps a decimal at 15 digits with a warning naming the field', () => {
    const warnings: string[] = [];
    const t = one([ID, { field: 'big', label: 'Big', type: 'amount', precision: 20 }], undefined, warnings);
    expect(col(t, 'big')).toMatchObject({ type: 'DECIMAL(15,2)', scale: 2 });
    expect(warnings.join('\n')).toMatch(/big/);
  });

  it('refuses names longer than 64 characters', () => {
    const id = 'x'.repeat(70);
    expect(() => moduleSchema(id, tableModule(id, [ID]))).toThrow(/longer than 64/);
  });

  it('shortens a long index name to a hash of the full name', () => {
    const long = 'f'.repeat(55);
    const m = tableModule('m', [ID, { field: long, label: 'F', type: 'text', max: 5 }]);
    const tab = (m.def as unknown as { tabs: Record<string, unknown>[] }).tabs[0];
    tab.large = true;
    tab.list = { entity: 'rows', keys: ['id'], filters: [long] };
    const t = moduleSchema('m', m)[0];
    expect(t.indexes[0].name).toMatch(/^ix_[0-9a-f]{12}$/);
  });

  it('gives no index to an unbounded TEXT column and warns', () => {
    const warnings: string[] = [];
    const m = tableModule('m', [ID, { field: 'note', label: 'Note', type: 'text' }, { field: 'nm', label: 'Nm', type: 'text', max: 20 }]);
    const tab = (m.def as unknown as { tabs: Record<string, unknown>[] }).tabs[0];
    tab.large = true;
    tab.list = { entity: 'rows', keys: ['id'], filters: ['note', 'nm'] };
    const t = moduleSchema('m', m, warnings)[0];
    expect(t.indexes.map(i => i.columns)).toEqual([['nm']]);
    expect(warnings.join('\n')).toMatch(/m__rows\.note is TEXT.*no index/);
  });

  it('refuses an item table without its header key column', () => {
    const base = SERVER_MODULES['sample-deals'];
    const def = base.def as unknown as { tabs: { kind: string; keys?: string[] }[] };
    const tabs = def.tabs.map(t => (t.kind === 'items' ? { ...t, keys: ['seq'] } : t));
    const bad = { ...base, def: { ...def, tabs } as unknown as AnyModuleDef };
    expect(() => moduleSchema('sample-deals', bad)).toThrow(/no column "deal"/);
  });

  it('types a key with no definition as VARCHAR(255) with a warning', () => {
    const warnings: string[] = [];
    const m = tableModule('m', [ID], { fields: { rows: ['id', 'k2'] } });
    (m.def as unknown as { tabs: { keys: string[] }[] }).tabs[0].keys = ['id', 'k2'];
    const t = moduleSchema('m', m, warnings)[0];
    expect(col(t, 'k2')).toMatchObject({ type: 'VARCHAR(255)', notNull: true });
    expect(warnings.join('\n')).toMatch(/k2/);
  });

  it('refuses a column name longer than 64 characters', () => {
    const f = 'c'.repeat(65);
    expect(() => one([ID, { field: f, label: 'C', type: 'text', max: 5 }])).toThrow(/longer than 64/);
  });

  it('refuses a primary key longer than 3072 bytes (utf8mb4)', () => {
    const keys = ['k1', 'k2', 'k3', 'k4'];
    const m = tableModule('m', keys.map(k => ({ field: k, label: k, type: 'text', key: true }) as AnyField));
    (m.def as unknown as { tabs: { keys: string[] }[] }).tabs[0].keys = keys;
    expect(() => moduleSchema('m', m)).toThrow('m__rows: the key is too long for the deployed database (4080 bytes, at most 3072); give its text key fields a smaller max.');
    (m.def as unknown as { tabs: { keys: string[] }[] }).tabs[0].keys = ['k1', 'k2', 'k3'];
    expect(moduleSchema('m', m)[0].primaryKey).toEqual(['k1', 'k2', 'k3']);
  });

  it('gives no index to a text column wider than 768 characters and warns', () => {
    const warnings: string[] = [];
    const m = tableModule('m', [ID, { field: 'wide', label: 'Wide', type: 'text', max: 769 }, { field: 'ok', label: 'Ok', type: 'text', max: 768 }]);
    const tab = (m.def as unknown as { tabs: Record<string, unknown>[] }).tabs[0];
    tab.large = true;
    tab.list = { entity: 'rows', keys: ['id'], filters: ['wide', 'ok'] };
    const t = moduleSchema('m', m, warnings)[0];
    expect(t.indexes.map(i => i.columns)).toEqual([['ok']]);
    expect(warnings).toContain('m__rows.wide is longer than 768 characters, so it gets no index; give the field a max of 768 or less to index it.');
  });

  it('gives no header-key index to an item table whose header key is longer than 3072 bytes', () => {
    const warnings: string[] = [];
    const base = SERVER_MODULES['sample-deals'];
    const def = base.def as unknown as { tabs: { kind: string; keys?: string[]; grid?: AnyField[] }[] };
    const tabs = def.tabs.map(t => (t.kind === 'items' ? { ...t, keys: ['seq'], grid: [...(t.grid ?? []), { field: 'deal', label: 'Deal', type: 'text', max: 800 } as AnyField] } : t));
    const flows = moduleSchema('sample-deals', { ...base, def: { ...def, tabs } as unknown as AnyModuleDef }, warnings)[1];
    expect(flows.indexes.some(i => i.columns.join() === 'deal')).toBe(false);
    expect(warnings).toContain('sample_deals__flows: its header key (deal) is longer than 3072 bytes, so it gets no index; give the header key fields a smaller max.');
  });

  it('refuses text fields too long together for one MySQL row', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ field: `t${i}`, label: `T${i}`, type: 'textarea', max: 4000 }) as AnyField);
    expect(() => one([ID, ...many])).toThrow('m__rows: its text fields are too long together for the deployed database; remove the max of long text fields (they are then stored as TEXT).');
    expect(() => one([ID, ...many.slice(0, 4)])).not.toThrow();
  });

  it('refuses a field named etag on an object list table', () => {
    const base = SERVER_MODULES['sample-deals'];
    const def = base.def as unknown as { header: AnyField[] };
    const bad = { ...base, def: { ...def, header: [...def.header, { field: 'etag', label: 'E' }] } as unknown as AnyModuleDef };
    expect(() => moduleSchema('sample-deals', bad)).toThrow(/etag/);
  });
});

describe('wantedSchema', () => {
  it('leaves devOnly modules out of the shipped schema', () => {
    // An application adds shipped modules of its own, so only the devOnly tables are pinned here.
    const shipped = new Set(wantedSchema(SERVER_MODULES, 'shipped').tables.map(t => t.name));
    const devOnly = wantedSchema(SERVER_MODULES, 'devOnly').tables.map(t => t.name);
    expect(devOnly.length).toBeGreaterThan(0);
    expect(devOnly.filter(name => shipped.has(name))).toEqual([]);
  });
  it('takes the devOnly modules for devOnly', () => {
    expect(wantedSchema(SERVER_MODULES, 'devOnly').tables.map(t => t.name)).toContain('sample_deals__deals');
  });
  it('never ships a reference example registered back for the tests; its tables are made like a dev-only one', () => {
    const app = tableModule('loans', [ID], {});
    const example = { ...tableModule('timebuckets', [ID], {}), reference: true as const };
    const modules = { loans: app, timebuckets: example };
    expect(wantedSchema(modules, 'shipped').tables.map(t => t.name)).toEqual(['loans__rows']);
    expect(wantedSchema(modules, 'devOnly').tables.map(t => t.name)).toEqual(['timebuckets__rows']);
  });
});
