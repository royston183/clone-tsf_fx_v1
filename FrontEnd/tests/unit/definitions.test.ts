// tests/integration/definitions.test.ts
// Checks every registered module definition (spec §2): drill targets name registered modules and filter them by their
// filterable fields with valid values; list filters and search name fields whose type has filter operators; layout
// columns exist; dashboard click-through targets exist. Each dashboard runs with its definition's sampleSelection.
import { describe, expect, it } from 'vitest';
import { hrefOfModule, hrefOfPage } from '@/config/catalog';
import { CUSTOM_PAGES } from '@/pages/registry';
import { parseDrillParams } from '@/lib/drill/params';
import { typeOf, valueFields, type AnyField } from '@/lib/fields';
import { listLayoutTarget, normalizeLayout, reportLayoutTarget } from '@/lib/layout/layout';
import { OPS_BY_TYPE, type AnyList } from '@/lib/list/types';
import type { DrillTarget } from '@/lib/report/types';
import { unitsOf } from '@/lib/report/units';
import { dashboardService } from '@core/server/dashboard-service';
import { isTableModule, MODULES } from '@/modules/registry';
import { SERVER_MODULES } from '@/modules/server-registry';
import { reportSourceProblem, seedOf as entrySeed } from '@/modules/tables';
import type { AnyModuleDef } from '@/modules/types';
import { actingAs, freshConfig, installTestPlatform, onSampleData } from '../support/platform';

installTestPlatform();

const ids = Object.keys(MODULES);
const seeds = new Map<string, ReturnType<typeof buildSeed>>();
function buildSeed(id: string) { const s = entrySeed(SERVER_MODULES[id]); return typeof s === 'function' ? s() : s; }
/** A module's seed, built once: seeds can be large and the drill checks ask for them per row. */
const seedOf = (id: string) => { let s = seeds.get(id); if (!s) { s = buildSeed(id); seeds.set(id, s); } return s; };
/** What a drill filter check needs of a target module, worked out once per module. */
const drillInfo = new Map<string, { fields: AnyField[] | null; lookups: ReturnType<AnyModuleDef['lookups']> }>();
function drillInfoOf(id: string, target: AnyModuleDef) {
  let i = drillInfo.get(id);
  if (!i) { i = { fields: drillFields(target), lookups: target.lookups(seedOf(id).lookups) }; drillInfo.set(id, i); }
  return i;
}
const listsOf = (def: AnyModuleDef): AnyList[] =>
  def.kind === 'object' ? [def.list] : isTableModule(def) ? def.tabs.flatMap(t => (t.large && t.list ? [t.list] : [])) : [];
const fieldOf = (list: AnyList, f: string): AnyField => list.fields.find(d => d.field === f) ?? { field: f, label: f, type: 'display' };

/** The fields a drill may filter a module by; null when the module takes no drill filters (table maintenance, upload). */
function drillFields(def: AnyModuleDef): AnyField[] | null {
  if (def.kind === 'object') return def.list.fields.filter(d => def.list.filters?.includes(d.field));
  if (def.kind === 'items' || def.kind === 'report' || def.kind === 'dashboard') return valueFields(def.selection);
  return null;
}
function checkTarget(t: DrillTarget, where: string): void {
  if (t.kind === 'page') {
    expect(Object.hasOwn(CUSTOM_PAGES, t.page), `${where}: page ${t.page} is registered`).toBe(true);
    expect(hrefOfPage(t.page), `${where}: page ${t.page} has a catalogue entry`).not.toBeNull();
    return;
  }
  if (t.kind !== 'screen') return;
  const target = Object.hasOwn(MODULES, t.module) ? MODULES[t.module] : undefined;
  expect(target, `${where}: drill target ${t.module} is registered`).toBeDefined();
  expect(hrefOfModule(t.module), `${where}: ${t.module} has a catalogue entry`).not.toBeNull();
  const info = target ? drillInfoOf(t.module, target) : undefined;
  const fields = info?.fields ?? null;
  expect(fields, `${where}: ${t.module} takes drill filters`).not.toBeNull();
  const params = new URLSearchParams(Object.entries(t.filters).map(([k, v]) => [`f.${k}`, v]));
  expect(parseDrillParams(params, 'f', fields ?? [], info?.lookups).dropped, `${where}: every filter is a valid filter of ${t.module}`).toEqual([]);
}

describe('module definitions', () => {
  // Dashboards run on the sample data of their seeds, whatever source the application gave the modules they read.
  onSampleData(...ids);
  it('registers every module in both registries and in the catalogue', () => {
    expect(Object.keys(SERVER_MODULES).filter(id => !id.startsWith('test-')).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(SERVER_MODULES[id].def, id).toBe(MODULES[id]);
      expect(MODULES[id].id, id).toBe(id);
      // A helper (internal) has no screen of its own; every other module opens from its catalogue entry.
      if (!MODULES[id].internal) expect(hrefOfModule(id), `${id} has a catalogue entry`).not.toBeNull();
      if (MODULES[id].kind === 'dashboard') expect(SERVER_MODULES[id].dashboard, `${id} has a server part`).toBeDefined();
    }
  });
  it('every object and table module says how records open, every report how breakdowns open', () => {
    const modes = ['page', 'popup', 'wizard'];
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind === 'object' || isTableModule(def)) {
        expect(modes, `${id}: opens.create`).toContain(def.opens?.create);
        expect(modes, `${id}: opens.open`).toContain(def.opens?.open);
      }
      if (def.kind === 'report') expect(['popup', 'page'], `${id}: breakdownOpens`).toContain(def.breakdownOpens);
    }
  });
  it('lets lists filter and search only by fields whose type has filter operators', () => {
    for (const id of ids) for (const list of listsOf(MODULES[id])) {
      for (const f of list.filters ?? []) expect(OPS_BY_TYPE[typeOf(fieldOf(list, f))] ?? [], `${id}: filter ${f}`).not.toEqual([]);
      for (const f of list.search ?? []) expect(OPS_BY_TYPE[typeOf(fieldOf(list, f))] ?? [], `${id}: search ${f}`).toContain('contains');
    }
  });
  it('has valid dashboard quarter starts, unit divisors and line-item columns', () => {
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind === 'dashboard' && def.quarterStartMonth !== undefined) expect(Number.isInteger(def.quarterStartMonth) && def.quarterStartMonth >= 1 && def.quarterStartMonth <= 12, `${id}: quarterStartMonth`).toBe(true);
      if (def.kind === 'report' || def.kind === 'dashboard') for (const u of def.units ?? []) expect(Number.isInteger(u.divisor) && u.divisor >= 1 && /^10*$/.test(String(u.divisor)), `${id}: unit ${u.id} divisor is a power of ten`).toBe(true);
      if (def.kind === 'report' && def.report.variant === 'lineItems') expect(def.report.columns.length, `${id}: line items have columns`).toBeGreaterThan(0);
    }
  });
  it('names layout columns that exist', () => {
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind === 'report' && def.report.variant === 'lineItems') {
        const t = reportLayoutTarget(def.report.columns, def.report.standard, def.report.layouts ?? {}, unitsOf(def.units).map(u => u.id));
        expect(normalizeLayout(def.report.standard, t), `${id}: the standard layout`).toEqual(def.report.standard);
      }
      if (def.kind === 'object' && def.list.layouts) {
        const t = listLayoutTarget(def.list);
        expect(normalizeLayout(t.standard, t), `${id}: the list's standard layout`).toEqual(t.standard);
      }
    }
  });
  it('reads a report over another module (source) from an object module whose list is its entity', () => {
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind !== 'report' || !def.source) continue;
      const target = Object.hasOwn(MODULES, def.source.module) ? MODULES[def.source.module] : undefined;
      expect(reportSourceProblem(def, target), `${id}: source ${def.source.module}`).toBe('');
    }
  });
  it('drills from reports only to registered modules, by their filterable fields', () => {
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind !== 'report') continue;
      const report = def.report;
      if (report.variant === 'lineItems' && report.open) {
        const target = Object.hasOwn(MODULES, report.open) ? MODULES[report.open] : undefined;
        expect(target?.kind, `${id}: open names an object module`).toBe('object');
        if (target?.kind === 'object') for (const k of target.list.keys) expect(report.columns.some(c => c.id === k) || (report.fields ?? []).includes(k), `${id}: lines carry ${k}`).toBe(true);
      }
      if (!def.drill) continue;
      // A report over another module (source) drills from that module's rows.
      const rows = seedOf(def.source?.module ?? id).tables[report.entity] ?? [];
      expect(rows.length, `${id}: sample rows`).toBeGreaterThan(0);
      const selection = Object.fromEntries(valueFields(def.selection).map(d => [d.field, rows[0][d.field] ?? '']));
      const columns: (string | null)[] = [null, ...report.columns.filter(c => c.drillable).map(c => c.id)];
      for (const row of rows.slice(0, 200)) for (const column of columns) checkTarget(def.drill(row, column, selection), `${id} ${JSON.stringify(row).slice(0, 60)} ${column}`);
    }
  });
  it('clicks through dashboards only to registered modules, by their filterable fields', async () => {
    const cfg = freshConfig();
    for (const id of ids) {
      const def = MODULES[id];
      if (def.kind !== 'dashboard') continue;
      expect(def.sampleSelection, `${id}: give the definition a sampleSelection`).toBeDefined();
      const out = await dashboardService(cfg, id).load(actingAs(), def.sampleSelection);
      for (const [sid, r] of Object.entries(out.sections)) {
        expect('error' in r ? r.error : '', `${id} section ${sid} loads`).toBe('');
        if (!('data' in r)) continue;
        if (r.data.kind === 'tiles') for (const t of r.data.tiles) if (t.drill) checkTarget(t.drill, `${id} tile ${t.label}`);
        if (r.data.kind === 'table') for (const [col, d] of Object.entries(r.data.drill ?? {})) if (d.target) checkTarget(d.target, `${id} ${sid} ${col}`);
      }
    }
  });
});
