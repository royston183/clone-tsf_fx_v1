// FO: Create Master Contract (ZSGTSFP001): commodity master contracts that FX deals are linked to.
// FO creates and edits them, then sends them to the Mid Office (status 01 Created → 02 Released to M.O.).
// Data: ZSGTSFTR_MAS_CON on the SLC middleware (rest.ts), shared with the TSF - FX Application.
import { col } from '@/lib/grid/grid';
import { formatAmount, formatDate } from '@/lib/fields/parse';
import type { FieldDef } from '@/lib/fields/types';
import type { Option, Row } from '@/lib/grid/types';
import type { ObjectModuleDef } from '../types';
import { ChildContractsTab } from './ChildContractsTab';
import { mcStatusText, mcStatusTone } from './lookups';

export interface McModel { id: string; text: string; entityDesc: string; currencyDesc: string }
export interface McLookups { origins: Option[]; commodities: Option[]; models: McModel[]; modelOptions: Option[]; payTerms: Option[]; statuses: Option[] }

const label = (options: Option[], value: string | undefined) => options.find(o => o.value === value)?.label ?? value ?? '';
const rows = (raw: Record<string, Row[]> | undefined, name: string): Row[] => raw?.[name] ?? [];

const mcNo: FieldDef<McLookups> = { field: 'mcNo', label: 'MC Number', type: 'code', max: 10, key: true, mono: true };
const status: FieldDef<McLookups> = { field: 'status', label: 'Status', type: 'select', options: lk => lk.statuses, statusTone: r => mcStatusTone(r.status) };
const origin: FieldDef<McLookups> = { field: 'origin', label: 'Origin Entity *', type: 'select', options: lk => lk.origins, required: true };
const mcDate: FieldDef<McLookups> = { field: 'mcDate', label: 'MC Date *', type: 'date', required: true };
const amountUsd: FieldDef<McLookups> = { field: 'amountUsd', label: 'MC Amount (USD) *', type: 'amount', currencyField: 'currency', precision: 15, required: true };
const exRate: FieldDef<McLookups> = { field: 'exRate', label: 'Exchange Rate *', type: 'decimal', scale: 4, precision: 11, required: true };
const mcRef: FieldDef<McLookups> = { field: 'mcRef', label: 'MC Reference No', type: 'text', max: 40, placeholder: 'e.g. MC/OSIPL/2026/001' };
const amountOrigin: FieldDef<McLookups> = {
  field: 'amountOriginShown', label: 'MC Amount (Origin)', type: 'display',
  computed: r => { const usd = Number(r.amountUsd), fx = Number(r.exRate); return usd > 0 && fx > 0 ? `${formatAmount((usd * fx).toFixed(2))} ${r.originCurrency ?? ''}`.trim() : ''; }
};
const commodity: FieldDef<McLookups> = { field: 'commodity', label: 'Commodity *', type: 'select', options: lk => lk.commodities, required: true };
const comDescLong: FieldDef<McLookups> = { field: 'comDescLong', label: 'Comm. Description Long', type: 'text', max: 255 };
const shipment: FieldDef<McLookups> = { field: 'shipStart', label: 'Shipment Window *', type: 'dateRange', toField: 'shipEnd', required: true };
const payTerms: FieldDef<McLookups> = { field: 'payTerms', label: 'Payment Terms', type: 'select', options: lk => lk.payTerms };
const pos: FieldDef<McLookups> = { field: 'pos', label: 'Port of Shipment', type: 'text', max: 100 };
const pod: FieldDef<McLookups> = { field: 'pod', label: 'Port of Destination', type: 'text', max: 100 };
const model: FieldDef<McLookups> = { field: 'model', label: 'FX Model *', type: 'select', options: lk => lk.modelOptions, required: true };
const entityString: FieldDef<McLookups> = { field: 'entityShown', label: 'Entity String', type: 'display', computed: (r, lk) => lk.models.find(m => m.id === r.model)?.entityDesc ?? r.entityDesc ?? '' };
const currencyString: FieldDef<McLookups> = { field: 'currencyShown', label: 'Currency String', type: 'display', computed: (r, lk) => lk.models.find(m => m.id === r.model)?.currencyDesc ?? r.currencyDesc ?? '' };
const foRemarks: FieldDef<McLookups> = { field: 'foRemarks', label: 'FO Remarks', type: 'textarea', max: 255 };
const moRemarks: FieldDef<McLookups> = { field: 'moRemarks', label: 'MO Remarks', type: 'display', computed: r => r.moRemarks || '—' };

const isoMinusMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
};

export const masterContract: ObjectModuleDef<McLookups> = {
  kind: 'object', id: 'master-contract', title: 'FO: Create Master Contract', noun: ['Master Contract', 'Master Contracts'],
  serviceKey: 'master-contract', storageKey: 'tsf-master-contract',
  // About twenty fields in four groups plus the six child contracts: each contract opens on its own page.
  opens: { create: 'page', open: 'page' },
  keyBySap: true,
  list: {
    entity: 'contracts', keys: ['mcNo'],
    columns: [
      col('status', 'Status', { text: r => mcStatusText(r.status), statusTone: r => mcStatusTone(r.status) }),
      col('mcNo', 'MC Number', { code: true }),
      col('origin', 'Origin Entity', { code: true }),
      col('model', 'FX Model', { code: true }),
      col('commodity', 'Commodity', { text: r => [r.commodity, r.commodityDesc].filter(Boolean).join(' - ') }),
      col('mcDate', 'MC Date', { text: r => formatDate(r.mcDate) }),
      col('amountUsd', 'MC Amount (USD)', { text: r => formatAmount(r.amountUsd) }),
      col('exRate', 'Exchange Rate', { text: r => (r.exRate ? Number(r.exRate).toFixed(4) : '') }),
      col('shipStart', 'Shipment Start', { text: r => formatDate(r.shipStart) }),
      col('shipEnd', 'Shipment End', { text: r => formatDate(r.shipEnd) }),
      col('mcRef', 'MC Reference No')
    ],
    fields: [mcNo, status, origin, model, commodity, mcDate, amountUsd, exRate, mcRef, { field: 'shipStart', label: 'Shipment Start', type: 'date' }, { field: 'shipEnd', label: 'Shipment End', type: 'date' }],
    search: ['mcNo', 'mcRef'], filters: ['status', 'origin', 'model', 'commodity', 'mcDate', 'amountUsd'], sort: ['mcNo', 'mcDate', 'amountUsd', 'shipEnd'],
    defaultSort: { field: 'mcNo', dir: -1 }, pageSizes: [20, 50, 100], layouts: {}
  },
  header: [mcNo, status, origin, mcDate, amountUsd, exRate],
  subtitle: (h, lk) => [label(lk.origins, h.origin), [h.commodity, h.commodityDesc].filter(Boolean).join(' - '), h.mcRef].filter(Boolean).join(' · '),
  tabs: [
    { kind: 'fields', id: 'details', label: 'Contract Details', groups: [
      { title: 'Basic Details', columns: 2, fields: [mcRef, amountOrigin] },
      { title: 'Commodity Details', columns: 2, fields: [commodity, comDescLong] },
      { title: 'Shipment Details', columns: 2, fields: [shipment, payTerms, pos, pod] },
      { title: 'FX Model Details', columns: 2, fields: [model, entityString, currencyString] },
      { title: 'Remarks', columns: 2, fields: [foRemarks, moRemarks] }
    ] },
    { kind: 'custom', id: 'children', label: 'Child Contracts', component: ChildContractsTab }
  ],
  defaults: () => ({ currency: 'USD', payTerms: 'P01' }),
  initial: () => ({ status: '01' }),
  // A created contract, or one MO returned for correction (11), can change; 21 is returned with "No Edit".
  editableWhen: h => ['01', '11'].includes(String(h.status)),
  deletableWhen: h => h.status === '01',
  check: (h, _items, _lk, mode) => {
    const problems: Record<string, string> = {};
    if (h.amountUsd && Number(h.amountUsd) <= 0) problems.amountUsd = 'Enter a valid amount greater than 0.';
    if (h.exRate && Number(h.exRate) <= 0) problems.exRate = 'Must be greater than 0.';
    if (mode === 'create' && h.mcDate && String(h.mcDate) < isoMinusMonth()) problems.mcDate = "Master Contract Date cannot be earlier than one month before today's date.";
    if (h.shipStart && h.shipEnd && String(h.shipEnd) < String(h.shipStart)) problems.shipStart = 'Must be ≥ start date.';
    return { header: problems, items: {}, messages: [] };
  },
  actions: [{
    id: 'send-to-mo', label: 'Send to M.O.', sapAction: 'SendToMo',
    confirm: 'Send this Master Contract to the Mid Office for confirmation? Only a newly created contract can be released.',
    when: h => h.status === '01',
    apply: () => ({ status: '02' }),
    mock: h => ({ ...h, status: '02' })
  }],
  lookups: raw => {
    const models = new Map<string, McModel>();
    for (const m of rows(raw, 'models')) if (!models.has(m.id)) models.set(m.id, { id: m.id, text: m.text, entityDesc: m.entityDesc, currencyDesc: m.currencyDesc });
    const sorted = [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
    return {
      origins: rows(raw, 'origins').map(o => ({ value: o.entity, label: `${o.entity} · ${o.company} · ${o.name}` })),
      commodities: rows(raw, 'commodities').map(c => ({ value: c.code, label: `${c.code} - ${c.text}` })),
      models: sorted,
      modelOptions: sorted.map(m => ({ value: m.id, label: `${m.id} - ${m.text}` })),
      payTerms: rows(raw, 'payTerms').map(p => ({ value: p.code, label: `${p.code} - ${p.text}` })),
      statuses: rows(raw, 'statuses').map(s => ({ value: s.code, label: s.text }))
    };
  }
};
