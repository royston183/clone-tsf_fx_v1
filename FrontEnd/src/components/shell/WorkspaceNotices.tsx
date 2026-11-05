import { Link, usePathname } from '@/lib/client/nav';
import { connectionAlert } from '@/lib/workspace-status';
import { Notice } from '@/components/ui/Notice';
import { useWorkspace } from './WorkspaceProvider';

/** The notices above every page, in both shells: the workspace could not be reloaded, or the SAP account is unusable. */
export function WorkspaceNotices() {
  const pathname = usePathname();
  const { workspace, error, reload } = useWorkspace();
  const alert = connectionAlert(workspace);
  return <>
    {error && <Notice error>{error}<button className="text-button" onClick={() => void reload()}>Retry connection</button></Notice>}
    {alert && pathname !== '/settings/sap-connection' && <Notice error>{alert}<Link className="text-button" href="/settings/sap-connection">SAP Connection</Link></Notice>}
  </>;
}
