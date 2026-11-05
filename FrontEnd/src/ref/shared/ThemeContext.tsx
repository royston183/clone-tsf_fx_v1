// The reference's day / night context, over the TSF_FX theme (the `data-theme` attribute on <html>, lib/client/theme.ts).
import type { ReactNode } from 'react'
import { useTheme as useWorkspaceTheme } from '@/lib/client/theme'

export type Theme = 'light' | 'dark'

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useWorkspaceTheme()
  return { theme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}

/** Not needed (the TSF_FX shell owns the theme); present so a stray import still resolves. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
