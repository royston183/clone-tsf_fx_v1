import { useCallback, useSyncExternalStore } from 'react';
import { THEME_KEY, type Theme } from './theme-script';

const EVENT = 'app:theme';
const subscribe = (onChange: () => void) => { addEventListener(EVENT, onChange); return () => removeEventListener(EVENT, onChange); };
const snapshot = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const serverSnapshot = (): Theme => 'light';

/** The theme set on <html> by the head script, and a setter that also remembers it in this browser. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode: applies to this page only */ }
    dispatchEvent(new Event(EVENT));
  }, []);
  return [theme, setTheme];
}
