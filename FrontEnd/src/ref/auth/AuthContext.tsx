// The reference's session context, over the TSF_FX workspace: the acting user is the SAP user of this tab (DEMO when
// none is set); sign-in / sign-out belong to the TSF_FX shell and its login page.
import { signOut as signOutWorkspace } from '@/lib/client/app-login'
import { actingUser } from '@/lib/client/sap-account'

export type User = { username: string; displayName: string }

export type AuthApi = {
  status: 'authenticated'
  user: User
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const signIn = async (): Promise<void> => { /* the TSF_FX login page signs in */ }
const signOut = async (): Promise<void> => {
  signOutWorkspace()
  location.assign('/login')
}

export function useAuth(): AuthApi {
  const username = actingUser()
  return { status: 'authenticated', user: { username, displayName: username }, signIn, signOut }
}

/** Not needed (the TSF_FX shell owns the session); present so a stray import still resolves. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
