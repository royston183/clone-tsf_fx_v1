import { describe, expect, it } from 'vitest';
import { SERVICES } from '@/config/services';
import { SERVER_MODULES } from '@/modules/server-registry';

// Where each module's data lives: inside SAP ('sap'), the application's own data ('app'), an external REST data service
// ('rest'), or still the sample data in its definition (no source), kept in memory until the module is given one.
const has = (id: string) => Object.hasOwn(SERVER_MODULES, id);
const samples = Object.entries(SERVER_MODULES).filter(([, entry]) => entry.def.devOnly);

describe('module data sources', () => {
  it('gives every module a source of sap, app, rest or none', () => {
    for (const [id, entry] of Object.entries(SERVER_MODULES)) expect([undefined, 'sap', 'app', 'rest'], id).toContain(entry.source);
  });
  it('never reads a Gallery sample from SAP', () => {
    for (const [id, entry] of samples) expect(entry.source, id).not.toBe('sap');
  });

  // The template's own examples, while they are registered (an application replaces them with its modules).
  // In an application without SAP (Nxt Platform Dev) services.json lists no service, and Time Buckets is its own data.
  it.runIf(has('timebuckets'))('reads Time Buckets from SAP when its service is listed, else keeps it as the application\'s own data', () => {
    const listed = SERVICES.some(s => s.key === 'timebuckets');
    expect(SERVER_MODULES.timebuckets.source).toBe(listed ? 'sap' : 'app');
  });
  it.runIf(has('sample-deals'))('keeps the Deals sample as the application\'s own data', () => {
    expect(SERVER_MODULES['sample-deals'].source).toBe('app');
  });
  it.runIf(samples.length > 0)('leaves every other sample on its sample data', () => {
    for (const [id, entry] of samples.filter(([id]) => id !== 'sample-deals')) expect(entry.source, id).toBeUndefined();
  });
});
