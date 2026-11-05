import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useRouter } from '@/lib/client/nav';
import { signOut as appSignOut } from '@/lib/client/app-login';
import { workspaceInfo } from '@/lib/client/workspace';
import { clearDashboardCache } from '@/lib/client/dashboard-cache';
import type { WorkspaceInfo } from '@/lib/workspace-types';

interface WorkspaceContextValue {
  workspace: WorkspaceInfo;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  signingOut: boolean;
  error: string;
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ initial, children }: { initial: WorkspaceInfo; children: ReactNode }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initial);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try { setWorkspace(workspaceInfo()); setError(''); } catch (e) { setError((e as Error).message); }
  }, []);
  // Sign-out ends the app login and forgets this tab's SAP account.
  const signOut = useCallback(async () => {
    setSigningOut(true);
    appSignOut();
    clearDashboardCache();
    router.replace('/login');
    router.refresh();
  }, [router]);
  return <WorkspaceContext.Provider value={{ workspace, reload, signOut, signingOut, error }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider.');
  return value;
}
