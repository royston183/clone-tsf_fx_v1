import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { galleryOn, loadConfig } from '@core/server/config';
import { moduleService } from '@core/server/module-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import { contract } from '@/modules/time-buckets/contract';
import { timeBuckets } from '@/modules/time-buckets/definition';
import seed from '@/modules/time-buckets/seed.json';
import { actingAs, installTestPlatform } from '../support/platform';

installTestPlatform();

beforeAll(() => { SERVER_MODULES['dev-sample'] = { def: { ...timeBuckets, id: 'dev-sample', devOnly: true }, contract, seed }; });
afterAll(() => { delete SERVER_MODULES['dev-sample']; });

describe('devOnly modules (the UI Gallery samples)', () => {
  it('serve sample data while the Gallery is enabled (a development page)', async () => {
    const cfg = loadConfig({});
    expect(galleryOn(cfg)).toBe(true);
    expect((await moduleService(cfg, 'dev-sample').view(actingAs())).mode).toBe('local');
  });
  it('are refused (404) in a production build of an application that reads SAP', () => {
    const cfg = loadConfig({ NODE_ENV: 'production' });
    expect(SERVER_MODULES.timebuckets.source).toBe('sap');
    expect(galleryOn(cfg)).toBe(false);
    expect(() => moduleService(cfg, 'dev-sample')).toThrow('Unknown application.');
  });
  it('never resolve a module name from the object prototype', () => {
    expect(() => moduleService(loadConfig({}), 'constructor')).toThrow('Unknown application.');
  });
});
