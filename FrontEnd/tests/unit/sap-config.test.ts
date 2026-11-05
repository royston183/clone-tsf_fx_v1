import { describe, expect, it } from 'vitest';
import { loadSapConfig, viteEnv } from '@core/sap/config';

describe('loadSapConfig', () => {
  it('defaults to the local relay, client 100 and the Time Buckets service', () => {
    const c = loadSapConfig({});
    expect(c.relayUrl).toBe('http://localhost:3001');
    expect(c.client).toBe('100');
    expect(c.timeoutMs).toBe(30000);
    expect(c.systemId).toBe('SAP');
    expect(c.account).toEqual({ username: '', password: '' });
    expect(c.services.timebuckets.base).toBe('http://localhost:3001/sap/opu/odata4/sap/zfs_sb_almtimebkt_o4_api/srvd_a2x/sap/zfs_sd_almtimebkt/0001/');
  });
  it('reads the relay, client, timeout, system and account', () => {
    const c = loadSapConfig({ SAP_RELAY_URL: 'https://relay.test:8443/prefix', SAP_CLIENT: '200', SAP_TIMEOUT_MS: '5000', SAP_SYSTEM_ID: 'DS4', SAP_USERNAME: 'U', SAP_PASSWORD: 'P' });
    expect(c).toMatchObject({ client: '200', timeoutMs: 5000, systemId: 'DS4', account: { username: 'U', password: 'P' } });
    expect(c.services.timebuckets.base.startsWith('https://relay.test:8443/sap/')).toBe(true);
  });
  it('refuses a wrong client or relay URL', () => {
    expect(() => loadSapConfig({ SAP_CLIENT: '1000' })).toThrow('Invalid SAP_CLIENT');
    expect(() => loadSapConfig({ SAP_RELAY_URL: 'http://u:p@x' })).toThrow('Invalid SAP_RELAY_URL');
    expect(() => loadSapConfig({ SAP_RELAY_URL: 'http://x/?a=1' })).toThrow('Invalid SAP_RELAY_URL');
    expect(() => loadSapConfig({ SAP_RELAY_URL: 'ftp://x' })).toThrow('Invalid SAP_RELAY_URL');
    expect(() => loadSapConfig({ SAP_RELAY_URL: 'nope' })).toThrow('Invalid SAP_RELAY_URL');
  });
  it('treats blank values as unset', () => {
    expect(loadSapConfig({ SAP_RELAY_URL: ' ', SAP_CLIENT: '' }).client).toBe('100');
  });
});

describe('viteEnv', () => {
  it('strips the VITE_ prefix and keeps only string values', () => {
    expect(viteEnv({ VITE_SAP_RELAY_URL: 'http://localhost:3001', VITE_SAP_CLIENT: '100', PROD: true, OTHER: 'x' }))
      .toEqual({ SAP_RELAY_URL: 'http://localhost:3001', SAP_CLIENT: '100' });
  });
});
