// The TRM pop-up's transaction sources (src/config/transactions.ts): the first matching source that has the transaction
// answers; the template's NIIF source answers the rest through the relay; an application's own source (a loan source
// here) goes in front of it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPlatform } from '@core/platform';
import { loadSapConfig } from '@core/sap/config';
import { TRANSACTION_SOURCES } from '@/config/transactions';
import { SERVICES } from '@/config/services';
import { browserPlatform } from '@/lib/client/browser-platform';
import { niifTransactions, TRM_SERVICE } from '@/lib/trm/niif';
import { readClass, readDeal, sourcesFor, type TransactionSource } from '@/lib/trm/sources';
import type { TrmDeal } from '@/lib/trm/types';
import { stubSessionStorage } from '../support/storage';
import { moneyMarketRecord, transactionRecord } from '../support/trm-records';

const loan: TrmDeal = { ...moneyMarketRecord, CompanyCode: '2000', FinancialTransaction: '0000060000001' };
/** Loans of company code 2000: deal 60000001 only; any other number is not a loan. */
const loans: TransactionSource = { id: 'loans', matches: t => t.bukrs === '2000', read: async t => (t.deal === '60000001' ? loan : null) };
const stock: TransactionSource = { id: 'stock', matches: () => true, read: async () => transactionRecord };
const deal = (bukrs: string, number: string) => ({ kind: 'deal' as const, bukrs, deal: number });

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('transaction sources', () => {
  it('asks the matching sources in order; an app source goes before NIIF', async () => {
    const sources = [loans, niifTransactions];
    expect(sourcesFor(deal('2000', '60000001'), sources).map(s => s.id)).toEqual(['loans', 'niif']);
    expect(sourcesFor(deal('1000', '1900004'), sources).map(s => s.id)).toEqual(['niif']);
    await expect(readDeal(deal('2000', '60000001'), sources)).resolves.toBe(loan);
  });
  it('passes a transaction a source does not have to the next one', async () => {
    await expect(readDeal(deal('2000', '1900004'), [loans, stock])).resolves.toBe(transactionRecord);
  });
  it('opens a security class only from a source that reads classes', async () => {
    const target = { kind: 'class' as const, bukrs: '2000', securityClass: '400013' };
    expect(sourcesFor(target, [loans, niifTransactions]).map(s => s.id)).toEqual(['niif']);
    await expect(readClass(target, [loans])).rejects.toThrow('No transaction source displays security class 400013 of company code 2000.');
    const classes: TransactionSource = { ...loans, readClass: async () => ({ securityClass: {}, transactions: [loan] }) };
    await expect(readClass(target, [classes])).resolves.toMatchObject({ transactions: [loan] });
  });
  it('says when no source has a transaction', async () => {
    await expect(readDeal(deal('3000', '1'), [loans])).rejects.toMatchObject({ status: 404, message: 'No transaction source displays transaction 1 of company code 3000.' });
    await expect(readDeal(deal('2000', '1'), [loans])).rejects.toMatchObject({ status: 404 });
  });
  // An application without SAP (Nxt Platform Dev) lists no SAP service: the NIIF checks run only where it is listed.
  const niifListed = SERVICES.some(s => s.key === TRM_SERVICE);
  it('keeps the NIIF source last, for every company code and number', () => {
    expect(TRANSACTION_SOURCES[TRANSACTION_SOURCES.length - 1]).toBe(niifTransactions);
    expect(niifTransactions.matches(deal('9999', 'X'))).toBe(true);
  });
  it.runIf(niifListed)('ships the NIIF Transaction service', () => {
    expect(SERVICES.find(s => s.key === TRM_SERVICE)).toMatchObject({ binding: 'ZFS_SB_TRMPOSVAL26E_O4_API', path: '/sap/opu/odata4/sap/zfs_sb_trmposval26e_o4_api/srvd_a2x/sap/zfs_sd_trmposval26e/0001/' });
  });
  it.runIf(niifListed)('the NIIF source reads the Transaction set through the relay with the tab\'s SAP account', async () => {
    stubSessionStorage();
    vi.stubEnv('VITE_SAP_USERNAME', 'tester');
    vi.stubEnv('VITE_SAP_PASSWORD', 'secret');
    setPlatform(browserPlatform(loadSapConfig({}), 'frontend'));
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ value: [transactionRecord] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await expect(niifTransactions.read(deal('1000', '1900004'))).resolves.toEqual(transactionRecord);
    expect(urls[0]).toMatch(/^http:\/\/localhost:3001\/sap\/opu\/odata4\/sap\/zfs_sb_trmposval26e_o4_api\/srvd_a2x\/sap\/zfs_sd_trmposval26e\/0001\/Transaction\?/);
    expect(urls[0]).toContain('sap-client=100');
  });
});
