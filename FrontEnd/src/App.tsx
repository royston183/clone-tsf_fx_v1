// The FrontEnd's pages: /login, /gallery and the catalogue (every other path), behind a live session.
import { useEffect, useState } from 'react';
import { CatalogView } from '@/components/shell/CatalogView';
import { GalleryView } from '@/components/gallery/GalleryView';
import { LoginView } from '@/components/login/LoginView';
import { newCaptcha } from '@/components/login/captcha-code';
import { NormalLoginView } from '@/components/normal/NormalLoginView';
import { NormalShell } from '@/components/normal/NormalShell';
import { WorkspaceProvider } from '@/components/shell/WorkspaceProvider';
import { WorkspaceShell } from '@/components/shell/WorkspaceShell';
import { Notice } from '@/components/ui/Notice';
import { APP } from '@/config/app.config';
import { resolveTrail } from '@/config/catalog';
import { NavProvider, useNavVersion, usePathname, useRouter } from '@/lib/client/nav';
import { workspaceInfo } from '@/lib/client/workspace';
import { APP_THEME } from '@/runtime';
import type { WorkspaceInfo } from '@/lib/workspace-types';

// APP_THEME picks the frame around the pages; both show the same pages.
const Shell = APP_THEME === 'normal' ? NormalShell : WorkspaceShell;
const Login = APP_THEME === 'normal' ? NormalLoginView : LoginView;
const segments = (pathname: string) => pathname.split('/').filter(Boolean).map(decodeURIComponent);

/** The workspace as this tab has it (app login, SAP account), read again after every router.refresh(). */
function useWorkspaceInfo(): { info: WorkspaceInfo | null; error: string } {
  const version = useNavVersion();
  const [state, setState] = useState<{ version: number; info: WorkspaceInfo | null; error: string }>({ version: -1, info: null, error: '' });
  useEffect(() => {
    let live = true;
    Promise.resolve().then(() => workspaceInfo()).then(
      info => { if (live) setState({ version, info, error: '' }); },
      (e: Error) => { if (live) setState({ version, info: null, error: e.message }); }
    );
    return () => { live = false; };
  }, [version]);
  return state.version === version ? state : { info: null, error: '' };
}

const Waiting = () => <main className="login"><section className="login-panel"><div className="login-card"><p>Loading…</p></div></section></main>;
const Unreachable = ({ error }: { error: string }) => (
  <main className="content"><Notice error>{error || 'The workspace could not be opened.'} Reload the page.</Notice></main>
);

function footnoteOf(w: WorkspaceInfo): string {
  return w.usesSap ? `Workspace login · SAP through the relay at ${w.relayUrl}` : 'Workspace login · Sample data';
}

function LoginPage() {
  const router = useRouter();
  const { info, error } = useWorkspaceInfo();
  // Drawn once when the page opens; LoginView draws a new one after each failed try.
  const [captcha] = useState(newCaptcha);
  const signedIn = Boolean(info?.session);
  useEffect(() => { document.title = `Sign In | ${APP.name}`; }, []);
  useEffect(() => { if (signedIn) router.replace('/'); }, [signedIn, router]);
  if (error) return <Unreachable error={error} />;
  if (!info || signedIn) return <Waiting />;
  return <Login footnote={footnoteOf(info)} initialCaptcha={captcha} />;
}

function WorkspacePage({ pathname }: { pathname: string }) {
  const router = useRouter();
  const version = useNavVersion();
  const { info, error } = useWorkspaceInfo();
  const signedOut = Boolean(info && !info.session);
  useEffect(() => { if (signedOut) router.replace('/login'); }, [signedOut, router]);
  const path = segments(pathname);
  const gallery = pathname === '/gallery';
  useEffect(() => {
    const { current, invalid } = resolveTrail(path, info?.gallery ?? false);
    document.title = `${gallery ? 'UI Gallery' : invalid ? 'Page not found' : current.title} | ${APP.name}`;
  });
  if (error) return <Unreachable error={error} />;
  if (!info || signedOut) return <Waiting />;
  return (
    // A new provider after every refresh, so it starts from the workspace just read.
    <WorkspaceProvider key={version} initial={info}>
      <Shell>
        {gallery
          ? (info.gallery ? <GalleryView /> : <section className="panel empty"><h1>Page not found</h1></section>)
          // Keyed by path so the page search starts empty on every page.
          : <CatalogView key={path.join('/')} path={path} />}
      </Shell>
    </WorkspaceProvider>
  );
}

function Pages() {
  const pathname = usePathname();
  return pathname === '/login' ? <LoginPage /> : <WorkspacePage pathname={pathname} />;
}

export function App() {
  return <NavProvider><Pages /></NavProvider>;
}
