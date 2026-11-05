import { CheckCircle2, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/client/theme';

const CHOICES = [['light', Sun, 'Light workspace'], ['dark', Moon, 'Dark workspace']] as const;

export function Appearance() {
  const [theme, setTheme] = useTheme();
  return (
    <section className="panel">
      <h2>Make yourself at home</h2>
      <p className="muted">Your preference is saved in this browser.</p>
      <div className="theme-options">{CHOICES.map(([value, Icon, label]) => (
        <button key={value} className={`theme-choice ${theme === value ? 'selected' : ''}`} onClick={() => setTheme(value)} aria-pressed={theme === value}>
          <Icon size={26} /><b>{label}</b>{theme === value && <CheckCircle2 size={18} />}
        </button>
      ))}</div>
    </section>
  );
}
