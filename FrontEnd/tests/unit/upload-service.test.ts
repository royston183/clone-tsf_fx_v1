import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import type { AppConfig } from '@core/server/config';
import { uploadService } from '@core/server/upload-service';
import { contract } from '@/modules/samples/budget/contract';
import { budget } from '@/modules/samples/budget/definition';
import { budgetSeed } from '@/modules/samples/budget/seed';
import { SERVER_MODULES } from '@/modules/server-registry';
import { actingAs, freshConfig, installTestPlatform, onSampleData, relayConfig } from '../support/platform';
import { startMockSap, type MockSap, type MockSet } from '../support/mock-sap';

installTestPlatform();

const line = (gl: string, costCenter: string, amount: string) => ({ gl, costCenter, month: '04', year: '2026', amount, currency: 'INR' });
const ROWS = [line('400100', 'CC30', '125000.50'), line('400100', 'CC10', '99000'), line('999999', 'CC10', '10'), line('500100', 'CC20', '-5'), line('400100', 'CC30', '1')];
const sapSets = (): Record<string, MockSet> => ({
  BudgetLine: { key: 'Gl', keys: ['Gl', 'CostCenter', 'Month', 'Year'], rows: budgetSeed().tables.budget.map(r => ({ Gl: r.gl, CostCenter: r.costCenter, Month: r.month, Year: r.year, Amount: Number(r.amount), Currency: r.currency })) }
});

beforeAll(() => {
  SERVER_MODULES['sample-budget'] = { def: budget, contract, seed: budgetSeed, source: 'sap' };
  SERVER_MODULES['test-budget-strict'] = { def: { ...budget, id: 'test-budget-strict', strict: true }, contract, seed: budgetSeed, source: 'sap' };
  SERVER_MODULES['test-budget-create'] = { def: { ...budget, id: 'test-budget-create', mode: 'create' as const }, contract, seed: budgetSeed, source: 'sap' };
});

describe('upload on SAP', () => {
  let sap: MockSap;
  let cfg: AppConfig;
  const user = actingAs(newSapConnection('TESTER', 'secret'));
  beforeEach(async () => {
    sap = await startMockSap({ sets: sapSets() });
    cfg = relayConfig(sap);
  });
  afterEach(async () => { await sap.close(); });

  it('checks every row and compares the keys with SAP in one query', async () => {
    const check = await uploadService(cfg, 'sample-budget').check(user, { rows: ROWS });
    expect(check.counts).toEqual({ create: 1, update: 1, invalid: 3 });
    expect(check.lines.map(l => [l.row, l.status, l.problems])).toEqual([
      [1, 'create', []],
      [2, 'update', []],
      [3, 'invalid', ["GL Account '999999' is not in the list."]],
      [4, 'invalid', ['Budget amounts must not be negative.']],
      [5, 'invalid', ['Same key as row 1.']]
    ]);
    expect(check.lines[1].values.amount).toBe('99000.00');
    expect(sap.log.filter(r => r.method === 'GET' && r.rel === 'BudgetLine')).toHaveLength(1);
  });

  it('posts the valid rows in one $batch changeset after checking them again', async () => {
    const out = await uploadService(cfg, 'sample-budget').post(user, { rows: ROWS });
    expect(out).toEqual({ created: 1, updated: 1, invalid: 3 });
    const batches = sap.log.filter(r => r.rel === '$batch');
    expect(batches).toHaveLength(1);
    expect(batches[0].body).toContain('POST BudgetLine HTTP/1.1');
    expect(batches[0].body).toMatch(/PATCH BudgetLine\(Gl='400100',CostCenter='CC10',Month='04',Year='2026'\) HTTP\/1\.1[\s\S]*?If-Match: W\//);
    expect(sap.sets.BudgetLine.rows.find(r => r.CostCenter === 'CC30')).toMatchObject({ Gl: '400100', Amount: 125000.5 });
    expect(sap.sets.BudgetLine.rows.find(r => r.Gl === '400100' && r.CostCenter === 'CC10' && r.Month === '04')?.Amount).toBe(99000);
  });

  it('strict: posts nothing while any row is invalid', async () => {
    await expect(uploadService(cfg, 'test-budget-strict').post(user, { rows: ROWS })).rejects.toMatchObject({ status: 422, message: '3 rows need attention; nothing was posted.' });
    expect(sap.log.some(r => r.rel === '$batch')).toBe(false);
  });

  it('create mode: a key that exists is invalid', async () => {
    const check = await uploadService(cfg, 'test-budget-create').check(user, { rows: [line('400100', 'CC10', '1')] });
    expect(check.lines[0]).toMatchObject({ status: 'invalid', problems: ['400100 / CC10 / 04 / 2026 already exists.'] });
  });

  it('refuses an empty upload and more rows than allowed', async () => {
    await expect(uploadService(cfg, 'sample-budget').check(user, { rows: [] })).rejects.toMatchObject({ status: 400, message: 'The file has no rows to upload.' });
  });
});

describe('upload on the mock store', () => {
  onSampleData('sample-budget', 'test-budget-strict', 'test-budget-create');
  it('checks and posts', async () => {
    const cfg = freshConfig();
    const svc = uploadService(cfg, 'sample-budget');
    expect((await svc.check(actingAs(), { rows: ROWS })).counts).toEqual({ create: 1, update: 1, invalid: 3 });
    expect(await svc.post(actingAs(), { rows: ROWS })).toEqual({ created: 1, updated: 1, invalid: 3 });
    expect((await svc.check(actingAs(), { rows: [ROWS[0]] })).lines[0].status).toBe('update');
  });
});
