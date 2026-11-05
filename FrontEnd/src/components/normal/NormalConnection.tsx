// The Normal navbar's SAP status chip. Everything about the SAP connection in the Normal frame is here, so an
// application without SAP (the C pack) removes this file's two lines in NormalNavbar and the navbar still works.
import { useRouter } from '@/lib/client/nav';
import { connectionChip } from '@/lib/workspace-status';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';

export function NormalConnection() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { label, tone } = connectionChip(workspace);
  return (
    <button className={`nt-connection nt-tone-${tone}`} title="SAP Connection" onClick={() => router.push('/settings/sap-connection')}>
      <span className="nt-connection-dot" aria-hidden="true" />{label}
    </button>
  );
}
