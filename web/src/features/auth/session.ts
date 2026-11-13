import { createContext, useContext } from 'react'
import type { BlockedNotice, Role, SessionUser, SignInInput } from '@/api/types'

export type { BlockedNotice, BlockedReason, Role, SessionUser, SignInInput } from '@/api/types'

export type SessionState =
  { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: SessionUser }

export interface SessionContextValue {
  session: SessionState
  /** Set when a sign-in or a re-check found the account blocked. The person is signed out. */
  blocked: BlockedNotice | null
  clearBlocked: () => void
  /** Signs in. Throws an AppError with a friendly code when it fails. */
  signIn: (input: SignInInput) => Promise<void>
  signOut: () => void
  /** Asks the data layer again, for example after the business name or currency changed. */
  refresh: () => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

/** The signed-in person. Use only inside screens behind a role guard. */
export function useSessionUser(): SessionUser {
  const { session } = useSession()
  if (session.status !== 'signed_in') throw new Error('useSessionUser needs a signed-in person')
  return session.user
}

export type { Role as SessionRole }
