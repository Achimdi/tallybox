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
  displayName: string
  /** Staff only. */
  username: string | null
  /** Everything below is null for the super-admin, who belongs to no business. */
  businessId: string | null
  businessName: string | null
  businessCode: string | null
  currencyCode: string | null
  timezone: string | null
}

export type SessionState =
  { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: SessionUser }

/**
 * Why someone with a correct password is not let in.
 * - suspended: the super-admin suspended the business
 * - lapsed:    reserved for later, when a subscription runs out
 * - disabled:  the owner turned this account off
 * - no_profile: the account belongs to no business
 */
export type BlockedReason = 'suspended' | 'lapsed' | 'disabled' | 'no_profile'

export interface BlockedNotice {
  reason: BlockedReason
  businessName: string | null
}

export type SignInInput =
  | { portal: 'owner'; email: string; password: string; captchaToken?: string | undefined }
  | {
      portal: 'staff'
      businessCode: string
      username: string
      password: string
      captchaToken?: string | undefined
    }

export interface SessionContextValue {
  session: SessionState
  /** Set when a sign-in or a re-check found the account blocked. The person is signed out. */
  blocked: BlockedNotice | null
  clearBlocked: () => void
  /** Signs in. Throws an AppError with a friendly code when it fails. */
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => void
  /**
   * Only while Supabase is not configured in development: pretend to be signed
   * in as a role, to look at layouts. Undefined in production builds.
   */
  devSignIn?: (role: Role) => void
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}
