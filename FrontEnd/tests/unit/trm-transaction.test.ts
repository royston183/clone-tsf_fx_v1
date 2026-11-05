// The NIIF Transaction read layer (src/core/sap/trm-transaction.ts), ported from the SAP Reporting app's tests: its
// queries, the retry with SAP's 13-digit key, its refusals and its messages.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newSapConnection } from '@core/sap/client';
import { readSecurityClass, readTransaction, type TrmSap } from '@core/sap/trm-transaction';
import { date } from '@/lib/trm/rules';
import { installTestPlatform } from '../support/platform';
import { transactionRecord } from '../support/trm-records';

installTestPlatform();
interface Call { method: string; path: string; query: URLSearchParams }
let calls: Call[];
/** SAP behind the relay: the Transaction set holds one deal of company code 1000 (or refuses the logon). */
function stubSap({ reject = false } = {}): TrmSap {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, query: url.searchParams });
    if (reject) return new Response('', { status: 401 });
    const filter = url.searchParams.get('$filter') ?? '';
    const rows = url.pathname.endsWith('/Transaction') && filter.includes("CompanyCode eq '1000'")
      && (filter.includes("FinancialTransaction eq '0000001900004'") || filter.includes("SecurityClass eq '0000000400013'")) ? [transactionRecord] : [];
    return new Response(JSON.stringify({ value: rows }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  return { settings: { client: '100', timeoutMs: 1000 }, conn: newSapConnection('TEST', `reject-${reject}`), service: { key: 'trm-transactions', base: 'http://127.0.0.1:3001/sap/' } };
}
beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('the NIIF Transaction set', () => {
  it('reads a transaction with its flows and resolves an unpadded number', async () => {
    const sap = stubSap();
    const deal = await readTransaction(sap, { bukrs: '1000', deal: '1900004' });
    expect(deal.FinancialTransaction).toBe('0000001900004');
    expect(deal.TransactionTypeName).toBe('Investment');
    expect(date(deal.FinTransPositionValueDate as string)).toBe('01-04-2026');
    expect(calls.length, 'unpadded first, then the 13-digit key').toBe(2);
    for (const c of calls) {
      expect(c.method).toBe('GET');
      expect(c.path).toBe('/sap/Transaction');
      expect(c.query.get('sap-client')).toBe('100');
      expect(c.query.get('$expand')).toBe('_Flow');
    }
    expect(calls[1].query.get('$filter')).toBe("CompanyCode eq '1000' and FinancialTransaction eq '0000001900004'");
  });

  it('lists the transactions of a security class in the company code, newest first', async () => {
    const sap = stubSap();
    const result = await readSecurityClass(sap, { bukrs: '1000', securityClass: '400013' });
    expect(result.securityClass.SecurityClass).toBe('0000000400013');
    expect(result.securityClass.Isin).toBe('IN0000000001');
    expect(result.transactions).toHaveLength(1);
    const query = calls[calls.length - 1].query;
    expect(query.get('$filter')).toMatch(/CompanyCode eq '1000' and SecurityClass eq '0000000400013'/);
    expect(query.get('$orderby')).toBe('FinTransPositionValueDate desc');
    expect(query.get('$top')).toBe('500');
  });

  it('never sends an invalid key to SAP, and says what it could not find', async () => {
    const sap = stubSap();
    await expect(readTransaction(sap, { bukrs: "1000' or 1", deal: '1900004' })).rejects.toMatchObject({ status: 400, message: 'Enter a valid company code.' });
    expect(calls).toHaveLength(0);
    await expect(readTransaction(sap, { bukrs: '1000', deal: 'MISSING' })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/^Transaction MISSING in company code 1000 was not found, or you are not authorised to display it\. The NIIF service covers product types 26A, 26B/) });
    await expect(readSecurityClass(sap, { bukrs: '1000', securityClass: 'NONE' })).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/^No transactions of security class NONE in company code 1000/) });
  });

  it('keeps a refused logon a gateway error', async () => {
    await expect(readTransaction(stubSap({ reject: true }), { bukrs: '1000', deal: '1900004' })).rejects.toMatchObject({ status: 502 });
  });
});
