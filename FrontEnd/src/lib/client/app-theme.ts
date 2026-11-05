// The application's theme as an attribute on <html>: Normal-theme CSS is scoped to [data-app-theme='normal'].
export type AppTheme = 'tiles' | 'normal';

export function applyAppTheme(theme: AppTheme, root: HTMLElement = document.documentElement): void {
  if (theme === 'normal') root.dataset.appTheme = 'normal';
  else delete root.dataset.appTheme;
}