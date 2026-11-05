// Read-only check against the real SAP system through the SAP relay. It never writes to SAP.
// Needs the relay running (VPN on) and SAP_USERNAME / SAP_PASSWORD (or their VITE_SAP_* values in .env.local).
import { describe, expect, it } from 'vitest';
import { checkService } from '@core/sap/client';
import { sapServiceOf } from '@core/sap/config';
import { loadConfig } from '@core/server/config';
import { moduleService } from '@core/server/module-service';
import { liveSap } from './live';

const live = await liveSap();
const title = `live ${live.sap.systemId} Time Buckets through ${live.sap.relayUrl} (read-only)`;

describe.skipIf(!live.ready)(live.ready ? title : `${title}: skipped, ${live.reason}`, () => {
  it('reads the service metadata', async () => {
    await expect(checkService({ client: live.sap.client, timeoutMs: live.sap.timeoutMs }, live.actor.sap!, sapServiceOf(live.sap, 'timebuckets'))).resolves.toMatchObject({ connected: true });
  });
  it('reads both bucket tables and the frequency domain', async () => {
    const view = await moduleService(loadConfig({}), 'timebuckets').view(live.actor);
    expect(view.mode).toBe('odata');
    expect(view.lookups.freqDomain.length).toBeGreaterThan(0);
    const all = [...view.tables.alm1, ...view.tables.alm2];
    for (const row of all) expect(row.bucket).not.toBe('');
    console.info(`ALM 1: ${view.tables.alm1.length} rows · ALM 2/3: ${view.tables.alm2.length} rows · ETag on rows: ${all.some(r => r.__etag) ? 'yes' : 'no'}`);
  });
});
