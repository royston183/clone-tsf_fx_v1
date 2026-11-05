import type { WorkspaceInfo } from './workspace-types';

/** The message the shell shows above every page while the tab's SAP account cannot be used, else null. */
export function connectionAlert(ws: WorkspaceInfo): string | null {
  const s = ws.session;
  return s?.sapStatus === 'unavailable' && s.sapError ? `SAP is unavailable: ${s.sapError}` : null;
}

/** The shell's SAP status chip (Tile top bar, Normal navbar): its words and its traffic-light tone. */
export function connectionChip(ws: WorkspaceInfo): { label: string; tone: 'green' | 'amber' | 'red' } {
  const s = ws.session;
  const label = s?.sapStatus === 'checking' ? 'Checking SAP…' : s?.sapStatus === 'connected' ? 'SAP connected' : s?.sapStatus === 'unavailable' ? 'SAP unavailable' : s?.sapUsername ? 'SAP not tested' : 'Connect SAP';
  return { label, tone: s?.sapStatus === 'connected' ? 'green' : s?.sapStatus === 'unavailable' ? 'red' : 'amber' };
}

/** Heading and text of the Overview's connection panel. */
export function connectionSummary(ws: WorkspaceInfo): { title: string; text: string } {
  if (!ws.usesSap) {
    return { title: 'No SAP data yet', text: 'No application reads SAP yet: the screens run on sample data or the application\'s own data.' };
  }
  const s = ws.session;
  if (!s || s.sapStatus === 'unavailable') {
    return { title: 'SAP is not reachable', text: `Start sap-relay (${ws.relayUrl}), check the VPN and your SAP user in Settings → SAP Connection, then Test & save.` };
  }
  if (!s.sapUsername) {
    return { title: 'No SAP account', text: 'Enter your SAP user, password and client in Settings → SAP Connection, then Test & save.' };
  }
  if (s.sapStatus !== 'connected') {
    return { title: 'SAP through the local relay', text: `Applications read and write ${ws.systemId} client ${ws.client} through the SAP relay at ${ws.relayUrl} as the SAP user ${s.sapUsername}.` };
  }
  return { title: 'Connected to SAP through OData V4', text: `Applications read and write ${ws.systemId} client ${ws.client} through their RAP services as the SAP user ${s.sapUsername}.` };
}
