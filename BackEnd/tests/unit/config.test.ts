import { afterEach, describe, expect, it } from 'vitest';
import { galleryOn, loadConfig } from '@core/server/config';
import { SERVER_MODULES } from '@/modules/server-registry';

describe('loadConfig: the BackEnd needs only the FrontEnd origins and NODE_ENV', () => {
  it('has safe defaults and treats blank values as unset', () => {
    expect(loadConfig({})).toEqual({ origins: ['http://127.0.0.1:3100', 'http://localhost:3100'], nodeEnv: 'development' });
    expect(loadConfig({ APP_ORIGINS: '  ', NODE_ENV: ' ' })).toEqual(loadConfig({}));
    expect(loadConfig({ NODE_ENV: 'production' }).nodeEnv).toBe('production');
  });
  it('keeps no SAP or sign-in settings, whatever the environment holds', () => {
    const cfg = loadConfig({ SAP_TIMEBUCKETS_URL: 'https://sap.example/x/', SAP_USERNAME: 'U', SAP_PASSWORD: 'p', SAP_CLIENT: '200', APP_PASSWORD: 'w' });
    expect(Object.keys(cfg).sort()).toEqual(['nodeEnv', 'origins']);
    // A value that once was an SAP or cookie setting is not read, so it cannot fail the start either.
    expect(() => loadConfig({ SAP_CLIENT: '1000', SAP_AUTH_MODE: 'sso', COOKIE_SAMESITE: 'none' })).not.toThrow();
  });
  it('parses APP_ORIGINS', () => {
    expect(loadConfig({ APP_ORIGINS: 'http://a:1, http://b:2' }).origins).toEqual(['http://a:1', 'http://b:2']);
  });
  it('defaults APP_ORIGINS to the FrontEnd host names on FRONTEND_PORT', () => {
    expect(loadConfig({ FRONTEND_PORT: '4100' }).origins).toEqual(['http://127.0.0.1:4100', 'http://localhost:4100']);
    expect(loadConfig({ APP_ORIGINS: '  ', FRONTEND_PORT: '3142' }).origins).toEqual(['http://127.0.0.1:3142', 'http://localhost:3142']);
    expect(loadConfig({ FRONTEND_PORT: '3142', APP_ORIGINS: 'http://a:1' }).origins).toEqual(['http://a:1']);
    expect(() => loadConfig({ FRONTEND_PORT: 'x' })).toThrow('FRONTEND_PORT');
    expect(() => loadConfig({ FRONTEND_PORT: '70000' })).toThrow('FRONTEND_PORT');
  });
  it('uses the exact Azure provisioner CORS origins (https only)', () => {
    expect(loadConfig({ WEBSITE_CORS_ALLOWED_ORIGINS: '["https://demo.z29.web.core.windows.net","http://x"]' }).origins).toEqual(['https://demo.z29.web.core.windows.net']);
    expect(loadConfig({ WEBSITE_CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example' }).origins).toEqual(['https://a.example', 'https://b.example']);
    expect(loadConfig({ WEBSITE_CORS_ALLOWED_ORIGINS: 'https://a.example', APP_ORIGINS: 'https://app.example.com' }).origins).toEqual(['https://app.example.com']);
  });
  it('also grants the mobile apps the provisioner listed: Android https://localhost and iOS capacitor://localhost, nothing else', () => {
    expect(loadConfig({ WEBSITE_CORS_ALLOWED_ORIGINS: '["https://demo.example","https://localhost","capacitor://localhost","capacitor://evil"]' }).origins)
      .toEqual(['https://demo.example', 'https://localhost', 'capacitor://localhost']);
    expect(loadConfig({ WEBSITE_CORS_ALLOWED_ORIGINS: 'https://demo.example,capacitor://localhost,ionic://localhost' }).origins).toEqual(['https://demo.example', 'capacitor://localhost']);
  });
});

describe('galleryOn', () => {
  const timebuckets = SERVER_MODULES.timebuckets;
  // Every module that reads SAP (the template's Time Buckets, and an application's own SAP modules).
  const sapModules = Object.entries(SERVER_MODULES).filter(([, m]) => m.source === 'sap');
  afterEach(() => { for (const [id, m] of sapModules) SERVER_MODULES[id] = m; });

  it('is on outside production', () => {
    expect(galleryOn({ origins: [], nodeEnv: 'development' })).toBe(true);
  });
  it('is off in production while a module reads SAP, and on while none does', () => {
    expect(timebuckets.source).toBe('sap');
    expect(galleryOn({ origins: [], nodeEnv: 'production' })).toBe(false);
    for (const [id, m] of sapModules) SERVER_MODULES[id] = { ...m, source: undefined };
    expect(galleryOn({ origins: [], nodeEnv: 'production' })).toBe(true);
  });
});
