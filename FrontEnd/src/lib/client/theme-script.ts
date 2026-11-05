export type Theme = 'light' | 'dark';
export const THEME_KEY = 'app-theme';

/** Runs in <head> before the first paint: the stored theme, else the OS preference (no light flash in dark mode). */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}})()`;
