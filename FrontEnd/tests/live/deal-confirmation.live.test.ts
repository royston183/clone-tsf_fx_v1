// Read-only live check of TSF MO Deal Confirmation: the queue (tsf-deals report per MO status) and one record read through
// trm-fx-app and fx-transaction. It never writes to SAP (no PATCH, no Settle). Needs the SAP account and the relay.
import { describe, expect, it } from 'vitest';
import { loadConfig } from '@core/server/config';
import { objectService } from '@core/server/object-service';
import { reportService } from '@core/server/report-service';
import { loadQueue, type QueueIo } from '@/pages/deal-confirmation/live';
import { liveSap } from './live';

const live = await liveSap();
const title = `live ${live.sap.systemId} deal confirmation through ${live.sap.relayUrl} (read-only)`;

describe.skipIf(!live.ready)(live.ready ? title : `${title}: skipped, ${live.reason}`, () => {
  const cfg = loadConfig({});
  // The Deal IDs are on the middleware (through the BackEnd), which this check does not call.
  const io: QueueIo = {
    report: selection => reportService(cfg, 'tsf-deals').run(live.actor, selection),
    dealIds: async () => ({ rows: [], total: 0, page: 1, pageSize: 500 })
  };

  it('reads the MO queue and one deal\'s workflow record and transaction', async () => {
    const upto = new Date().toISOString().slice(0, 10);
    const { deals } = await loadQueue({ from: '', to: '', upto, trader: '' }, io);
    console.info(`queue up to ${upto}: ${deals.length} deals (${['03', '04', '06'].map(s => `${s}: ${deals.filter(d => d.status === s).length}`).join(', ')})`);
    expect(deals.every(d => ['03', '04', '06'].includes(d.status))).toBe(true);
    const first = deals[0];
    if (!first) return;
    const app = await objectService(cfg, 'trm-fx-app').read(live.actor, { companyCode: first.companyCode, financialTransaction: first.transaction });
    expect(app.header.txnStatus).toBe(first.status);
    expect(app.header.__etag).toBeTruthy();
    const tx = await objectService(cfg, 'fx-transaction').read(live.actor, { companyCode: first.companyCode, financialTransaction: first.transaction });
    console.info(`${first.companyCode}-${first.transaction}: TrmFxApp status ${String(app.header.txnStatus)}, FxTransaction activity category ${String(tx.header.activityCategory)}`);
    expect(tx.header.financialTransaction).toBe(first.transaction);
  });
});
