import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, LogOut, PlugZap, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { resetAccount } from '@/lib/client/sap-account';
import { checkSapService, saveSapAccount } from '@/lib/client/workspace';
import { useWorkspace } from '@/components/shell/WorkspaceProvider';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { TrafficLightTag } from '@/components/ui/Badge';

interface Check { connected: boolean; checkedAt?: string; message?: string }
interface Outcome { ok: boolean; text: string }

/** The tab's SAP account: tested through the relay and saved for this tab only on success. */
function AccountForm({ username: initialUser, client: initialClient, busy, onSave, onReset }: {
  username: string; client: string; busy: boolean;
  onSave: (account: { username: string; password: string; client: string }) => void; onReset: () => void;
}) {
  const [username, setUsername] = useState(initialUser);
  const [password, setPassword] = useState('');
  const [client, setClient] = useState(initialClient);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ username, password, client });
    setPassword('');
  }
  return (
    <form onSubmit={submit} aria-label="SAP account">
      <Field label="SAP user" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" spellCheck={false} required />
      <Field label="SAP password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
        placeholder={initialUser ? 'Leave empty to keep the saved one' : 'Required'} />
      <Field label="SAP client" value={client} onChange={e => setClient(e.target.value)} inputMode="numeric" maxLength={3} pattern="\d{3}" title="Three digits" required />
      <div className="kit-account-actions">
        <button className="button" disabled={busy}><RefreshCw size={15} className={busy ? 'spin' : ''} />{busy ? 'Testing…' : 'Test & save'}</button>
        <button type="button" className="button secondary" disabled={busy} onClick={onReset}><RotateCcw size={15} />Reset to default</button>
      </div>
    </form>
  );
}

export function SapConnection() {
  const { workspace, reload, signOut, signingOut } = useWorkspace();
  const [busy, setBusy] = useState('');
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const s = workspace.session;

  async function check(key: string) {
    setBusy(key);
    try { const r = await checkSapService(key); setChecks(p => ({ ...p, [key]: r })); }
    catch (e) { setChecks(p => ({ ...p, [key]: { connected: false, message: (e as Error).message } })); }
    finally { setBusy(''); await reload(); }
  }
  async function save(account: { username: string; password: string; client: string }) {
    setBusy('account');
    setOutcome(null);
    try {
      await saveSapAccount(account);
      setOutcome({ ok: true, text: `SAP accepted ${account.username.trim().toUpperCase()} on client ${account.client.trim()}. Saved for this tab.` });
      setChecks({});
    } catch (e) {
      setOutcome({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
      await reload();
    }
  }
  async function reset() {
    resetAccount();
    setOutcome(null);
    setChecks({});
    await reload();
  }

  return (
    <div className="settings-layout">
      <section className="panel">
        <span className="section-icon"><PlugZap size={24} /></span>
        <h2>SAP Connection</h2>
        <p className="muted">Every SAP call goes from this browser through the SAP relay at {workspace.relayUrl}, with the SAP account below and its own SAP authorizations.</p>
        {s && <Notice><CheckCircle2 size={17} />Signed in as <strong>{s.username}</strong>{s.sapUsername && <> · SAP user <strong>{s.sapUsername}</strong> · {workspace.systemId} / {workspace.client}</>}</Notice>}
        {s?.sapError && <Notice error><AlertCircle size={17} />{s.sapError}</Notice>}
        {/* Keyed by the saved account, so the form shows it again after Test & save or Reset. */}
        <AccountForm key={`${s?.sapUsername ?? ''}|${workspace.client}`} username={s?.sapUsername ?? ''} client={workspace.client} busy={busy === 'account'} onSave={a => void save(a)} onReset={() => void reset()} />
        {outcome && (outcome.ok ? <Notice><CheckCircle2 size={17} />{outcome.text}</Notice> : <Notice error><AlertCircle size={17} />{outcome.text}</Notice>)}
        <button className="button secondary" disabled={signingOut} onClick={() => void signOut()}><LogOut size={16} />Sign out</button>
        <div className="security-note"><ShieldCheck size={16} /><span>The SAP account is kept for this tab only and is forgotten at sign-out or when the tab closes. The relay keeps SAP's session; this page never stores SAP cookies.</span></div>
      </section>
      <section className="panel">
        <h2>SAP System & OData Services</h2>
        <p className="muted">Each application uses one RAP service binding on {workspace.systemId}, client {workspace.client}, reached through the SAP relay at {workspace.relayUrl}. Service paths are listed in config/services.json.</p>
        <div className="service-list">{workspace.services.map(service => {
          const c = checks[service.key];
          const tested = c && busy !== service.key;
          return (
            <div className="service" key={service.key}>
              <div><b>{service.title} · {service.binding}</b><TrafficLightTag tone={tested ? c.connected ? 'green' : 'red' : 'amber'}>{tested ? (c.connected ? 'Verified' : 'Check failed') : 'Not tested'}</TrafficLightTag></div>
              <p>{service.path}</p>
              <small className="muted">Relay {workspace.relayUrl}</small>
              {tested && c.message && <Notice error>{c.message}</Notice>}
              {tested && c.connected && c.checkedAt && <small className="muted">Checked {new Date(c.checkedAt).toLocaleTimeString()}</small>}
              <button className="button secondary small" disabled={Boolean(busy) || !s?.sapUsername} onClick={() => void check(service.key)}>
                <RefreshCw size={14} className={busy === service.key ? 'spin' : ''} />{busy === service.key ? 'Testing…' : 'Test connection'}
              </button>
            </div>
          );
        })}</div>
      </section>
    </div>
  );
}
