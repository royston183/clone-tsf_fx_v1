// The Normal theme's sign-in page (LAS look). Same contract and sign-in logic as LoginView (useLoginForm).
import { ArrowRight, Eye, EyeOff, Moon, ShieldCheck, Sun } from 'lucide-react';
import { APP } from '@/config/app.config';
import { useTheme } from '@/lib/client/theme';
import { Notice } from '@/components/ui/Notice';
import { Captcha } from '@/components/login/Captcha';
import { useLoginForm } from '@/components/login/useLoginForm';

const L = APP.login;

export function NormalLoginView({ footnote, initialCaptcha }: { footnote: string; initialCaptcha: string }) {
  const [theme, setTheme] = useTheme();
  const { username, setUsername, password, setPassword, show, setShow, captcha, captchaInput, setCaptchaInput, busy, error, refreshCaptcha, submit } = useLoginForm(initialCaptcha);

  return (
    <main className="nt-login">
      <section className="nt-login-pitch">
        <div className="nt-login-brand"><img src={APP.logo} alt="" className="nt-login-mark" /><div><strong>{APP.name}</strong><small>{APP.subtitle}</small></div></div>
        <div className="nt-pitch-body">
          <span className="nt-login-kicker">{L.kicker}</span>
          <h1>{L.headline[0]}<br />{L.headline[1]}</h1>
          <p>{L.intro}</p>
          <div className="nt-login-benefits">{L.benefits.map(([title, detail]) => <div key={title}><b>{title}</b><small>{detail}</small></div>)}</div>
          <div className="nt-login-flow"><p>{L.flowTitle}</p><ol>{L.flow.map(([number, title, detail]) => <li key={number}><i aria-hidden="true" /><span>{number}</span><b>{title}</b><small>{detail}</small></li>)}</ol></div>
          <div className="nt-login-capabilities">{L.capabilities.map(([group, items]) => <div key={group}><b>{group}</b><span>{items.map(item => <small key={item}>{item}</small>)}</span></div>)}</div>
        </div>
        <footer>{APP.name} <span>{APP.subtitle}</span></footer>
      </section>
      <section className="nt-login-panel">
        <button type="button" className="nt-login-theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-pressed={theme === 'dark'} title={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'}>
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />} {theme === 'light' ? 'Night' : 'Day'}
        </button>
        <form onSubmit={submit} className="nt-login-card">
          <h2>Welcome back</h2>
          <p>Sign In To Continue To {APP.name}.</p>
          <span className="nt-login-rule" aria-hidden="true" />
          <label className="nt-login-field"><span>Username</span>
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="nt-login-field"><span>Password</span>
            <div className="nt-password-control">
              <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
              <button type="button" onClick={() => setShow(!show)} aria-label={`${show ? 'Hide' : 'Show'} password`}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <div className="nt-login-field"><span>Captcha<b> *</b></span>
            <div className="nt-captcha-row"><Captcha code={captcha} refresh={refreshCaptcha} /><input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="Enter the code" aria-label="Captcha code" autoComplete="off" spellCheck={false} maxLength={5} required /></div>
          </div>
          {error && <Notice error>{error}</Notice>}
          <button className="nt-login-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></button>
          <div className="nt-login-note"><ShieldCheck size={15} />{footnote}</div>
        </form>
      </section>
    </main>
  );
}
