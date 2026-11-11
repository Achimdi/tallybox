import { createContext, useContext } from 'react'

/**
 * Who is using the app.
 *
 * - super_admin: the developer. Manages businesses and activation codes.
 * - owner: runs one business. Full control of that business.
 * - staff: takes orders only.
 */
export type Role = 'super_admin' | 'owner' | 'staff'

export interface SessionUser {
  id: string
  role: Role
  /** Null for the super-admin, who belongs to no business. */
  businessId: string | null
  businessName: string | null
  displayName: string
}

export type SessionState =
  { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: SessionUser }

export interface SessionContextValue {
  session: SessionState
  signOut: () => void
  /**
   * Development preview only: pretend to be signed in as a role so layouts and
   * guards can be seen before real sign-in exists. Undefined in production builds.
   */
  devSignIn?: (role: Role) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}
