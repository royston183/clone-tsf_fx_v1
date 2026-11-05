import { ArrowRight, Eye, EyeOff, Moon, ShieldCheck, Sun } from 'lucide-react';
import { APP } from '@/config/app.config';
import { useTheme } from '@/lib/client/theme';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { Captcha } from './Captcha';
import { useLoginForm } from './useLoginForm';

const L = APP.login;

export function LoginView({ footnote, initialCaptcha }: { footnote: string; initialCaptcha: string }) {
  const [theme, setTheme] = useTheme();
  const { username, setUsername, password, setPassword, show, setShow, captcha, captchaInput, setCaptchaInput, busy, error, refreshCaptcha, submit } = useLoginForm(initialCaptcha);

  return (
    <main className="login">
      <section className="login-pitch">
        <div className="brand light"><img src={APP.logo} alt="" className="login-mark" /><div><strong>{APP.name}</strong><small>{APP.subtitle}</small></div></div>
        <div className="pitch-body">
          <span className="login-kicker">{L.kicker}</span>
          <h1>{L.headline[0]}<br />{L.headline[1]}</h1>
          <p>{L.intro}</p>
          <div className="login-benefits">{L.benefits.map(([title, detail]) => <div key={title}><b>{title}</b><small>{detail}</small></div>)}</div>
          <div className="login-flow"><p>{L.flowTitle}</p><ol>{L.flow.map(([number, title, detail]) => <li key={number}><i aria-hidden="true" /><span>{number}</span><b>{title}</b><small>{detail}</small></li>)}</ol></div>
          <div className="login-capabilities">{L.capabilities.map(([group, items]) => <div key={group}><b>{group}</b><span>{items.map(item => <small key={item}>{item}</small>)}</span></div>)}</div>
        </div>
        <footer>{APP.name} <span>{APP.subtitle}</span></footer>
      </section>
      <section className="login-panel">
        <button type="button" className="button secondary small login-theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-pressed={theme === 'dark'} title={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'}>
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />} {theme === 'light' ? 'Night' : 'Day'}
        </button>
        <form onSubmit={submit} className="login-card">
          <h2>Welcome back</h2>
          <p>Sign In To Continue To {APP.name}.</p>
          <span className="login-rule" aria-hidden="true" />
          <Field label="Username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          <label className="field"><span>Password</span>
            <div className="password-control">
              <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required />
              <button type="button" onClick={() => setShow(!show)} aria-label={`${show ? 'Hide' : 'Show'} password`}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <div className="field"><span>Captcha<b> *</b></span>
            <div className="captcha-row"><Captcha code={captcha} refresh={refreshCaptcha} /><input value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} placeholder="Enter the code" aria-label="Captcha code" autoComplete="off" spellCheck={false} maxLength={5} required /></div>
          </div>
          {error && <Notice error>{error}</Notice>}
          <button className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} /></button>
          <div className="login-note"><ShieldCheck size={15} />{footnote}</div>
        </form>
      </section>
    </main>
  );
}
