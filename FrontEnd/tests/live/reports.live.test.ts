// Read-only checks of the report modules against the real SAP system through the SAP relay. They never write to SAP.
// A report runs when its data source is SAP and LIVE_REPORT_SELECTIONS holds its selection, e.g.
// LIVE_REPORT_SELECTIONS={"sample-liquidity":{"company":"1000","month":"03","year":"2026"}}. Needs the SAP account.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/grid/types';
import { loadConfig } from '@core/server/config';
import { reportService } from '@core/server/report-service';
import { SERVER_MODULES } from '@/modules/server-registry';
import { liveSap } from './live';

const live = await liveSap();
const selections = ((): Record<string, Row> => { try { return JSON.parse(process.env.LIVE_REPORT_SELECTIONS ?? '{}') as Record<string, Row>; } catch { return {}; } })();
const reports = Object.entries(SERVER_MODULES).filter(([id, m]) => m.def.kind === 'report' && m.source === 'sap' && selections[id]).map(([id]) => id);
const title = `live ${live.sap.systemId} reports through ${live.sap.relayUrl} (read-only)`;

describe.skipIf(!live.ready || !reports.length)(live.ready ? title : `${title}: skipped, ${live.reason}`, () => {
  it.each(reports)('%s runs for its live selection', async id => {
    const out = await reportService(loadConfig({}), id).run(live.actor, selections[id]);
    expect(out.meta.total).toBe(out.rows.length);
    console.info(`${id}: ${out.rows.length} rows · ${out.meta.selectionText}`);
  });
});
