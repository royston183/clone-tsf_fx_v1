import { DataTable } from '@/components/table/DataTable';
import { applications } from '@/config/catalog';
import { onSampleData, sourceStatus } from '@/lib/client/data';
import { useSort } from '@/lib/client/use-sort';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { SortTh } from '@/components/ui/SortTh';
import { TrafficLightTag } from '@/components/ui/Badge';

const COLUMNS: [string, string][] = [['app', 'Application'], ['binding', 'Service binding'], ['path', 'Service path'], ['status', 'Status']];

export function ServiceMappings() {
  const { workspace } = useWorkspace();
  const rows = applications.map(app => {
    const svc = workspace.services.find(s => s.key === app.service);
    // The status follows the module's source, not whether config/services.json lists a path for it.
    const status = sourceStatus(app.module);
    return { id: app.id, app: app.title, binding: svc?.binding ?? '', path: svc?.path ?? '', status: status.label,
      tone: status.sap || (app.module && !onSampleData(app.module)) ? 'green' as const : 'amber' as const };
  });
  const sorted = useSort(rows, (r, col) => r[col as keyof typeof r]);
  return (
    <section className="panel">
      <h2>Application service mappings</h2>
      <p className="muted">Each service path is listed in config/services.json and reached through the SAP relay at {workspace.relayUrl}. The path must be a published OData V4 service binding.</p>
      <div className="table-wrap"><DataTable>
        <thead><tr>{COLUMNS.map(([col, label]) => <SortTh key={col} col={col} sort={sorted.sort} onSort={sorted.toggle}>{label}</SortTh>)}</tr></thead>
        <tbody>{sorted.rows.map(r => <tr key={r.id}><td>{r.app}</td><td><code>{r.binding}</code></td><td><code>{r.path}</code></td><td><TrafficLightTag tone={r.tone}>{r.status}</TrafficLightTag></td></tr>)}</tbody>
      </DataTable></div>
    </section>
  );
}
