import { Link } from '@/lib/client/nav';
import { ChevronRight, PlugZap } from 'lucide-react';

export function SettingsNote() {
  return (
    <div className="workspace-note">
      <span className="note-icon"><PlugZap size={21} /></span>
      <div><b>One workspace. Connected to SAP.</b><p>Manage your SAP session, review service mappings and personalize your workspace.</p></div>
      <Link className="text-button" href="/settings/sap-connection">SAP Connection<ChevronRight size={15} /></Link>
    </div>
  );
}
