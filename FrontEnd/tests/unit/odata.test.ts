import { describe, expect, it } from 'vitest';
import { entityPath, nextQuery, odataString, rowsOf, sapErrorMessage, serviceUrl } from '@core/sap/odata';
import { HttpError } from '@/lib/errors';

const BASE = 'https://sap.example:44300/sap/opu/odata4/sap/zfs_sb_x_o4_api/srvd_a2x/sap/zfs_sd_x/0001/';

describe('literals and keys', () => {
  it('doubles quotes in string literals', () => expect(odataString("O'Neil")).toBe("'O''Neil'"));
  it('builds entity paths', () => {
    expect(entityPath('Alm1Bucket', { Bucket: 'B01' })).toBe("Alm1Bucket(Bucket='B01')");
    expect(entityPath('Map', { Bukrs: '1000', Saknr: '0001' })).toBe("Map(Bukrs='1000',Saknr='0001')");
    expect(entityPath('Limit', { ValidFrom: '2026-01-01' }, { ValidFrom: 'date' })).toBe('Limit(ValidFrom=2026-01-01)');
    expect(entityPath('Alm1Bucket', { Bucket: 'A#1 /?' })).toBe("Alm1Bucket(Bucket='A%231%20%2F%3F')");
  });
  it('refuses a number or date key that is not one (400), since those are written bare', () => {
    expect(entityPath('Flow', { Seq: '-12' }, { Seq: 'number' })).toBe('Flow(Seq=-12)');
    expect(() => entityPath('Flow', { Seq: "1)/X('y'" }, { Seq: 'number' })).toThrow(HttpError);
    expect(() => entityPath('Limit', { ValidFrom: '2026-01-01)' }, { ValidFrom: 'date' })).toThrow(/not a valid date/);
  });
});

describe('serviceUrl', () => {
  it('adds sap-client exactly once and keeps allowed options', () => {
    const url = serviceUrl(BASE, 'Alm1Bucket', '$top=5&sap-client=050&$filter=Bucket eq \'B01\'', '100');
    expect(url.searchParams.getAll('sap-client')).toEqual(['100']);
    expect(url.searchParams.get('$top')).toBe('5');
    expect(url.pathname.endsWith('/0001/Alm1Bucket')).toBe(true);
  });
  it('uses the service root for an empty path', () => {
    expect(serviceUrl(BASE, '', undefined, '100').href).toBe(`${BASE}?sap-client=100`);
  });
  it('rejects unknown options and paths outside the service', () => {
    expect(() => serviceUrl(BASE, 'X', '$apply=1', '100')).toThrow(HttpError);
    expect(() => serviceUrl(BASE, '../other', '', '100')).toThrow('Invalid OData path.');
    expect(() => serviceUrl(BASE, '/sap/other', '', '100')).toThrow('Invalid OData path.');
    expect(() => serviceUrl(BASE, 'https://evil.example/x', '', '100')).toThrow('Invalid OData path.');
  });
});

describe('responses', () => {
  it('follows nextLink without sap-client', () => {
    expect(nextQuery({ '@odata.nextLink': 'Alm1Bucket?$skiptoken=2&sap-client=100' })).toBe('%24skiptoken=2');
    expect(nextQuery({ value: [] })).toBe('');
    expect(rowsOf({ value: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(rowsOf({})).toEqual([]);
  });
  it('reads SAP error messages in every shape', () => {
    expect(sapErrorMessage(400, JSON.stringify({ error: { message: 'Bad bucket' } }))).toBe('Bad bucket');
    expect(sapErrorMessage(400, JSON.stringify({ error: { message: { value: 'V2 style' } } }))).toBe('V2 style');
    expect(sapErrorMessage(400, JSON.stringify({ error: { message: 'Top', details: [{ message: 'Detail 1' }, { message: 'Top' }] } }))).toBe('Top · Detail 1');
    expect(sapErrorMessage(500, '<html>Server error</html>')).toBe('SAP returned HTTP 500.');
  });
});
