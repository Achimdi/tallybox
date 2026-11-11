import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { readStored, removeStored, writeStored } from '@/lib/storage'
import {
  SessionContext,
  type Role,
  type SessionContextValue,
  type SessionState,
  type SessionUser,
} from './session'

/**
 * PHASE 0 STUB. Real sign-in (Supabase Auth) replaces this in Phase 1.
 *
 * In production builds everyone is signed out, so every guarded route is closed.
 * In development you can preview a role from the welcome page. The preview is
 * layout-only: there is no data behind it and nothing to protect yet. Real
 * protection is Row Level Security in the database, never this file.
 */

const DEV_ROLE_KEY = 'tb.dev.role'
const ROLES: readonly Role[] = ['super_admin', 'owner', 'staff']

const DEV_USERS: Record<Role, SessionUser> = {
  staff: {
    id: 'dev-staff',
    role: 'staff',
    businessId: 'dev-business',
    businessName: 'Demo Shop',
    displayName: 'Demo Staff',
  },
  owner: {
    id: 'dev-owner',
    role: 'owner',
    businessId: 'dev-business',
    businessName: 'Demo Shop',
    displayName: 'Demo Owner',
  },
  super_admin: {
    id: 'dev-admin',
    role: 'super_admin',
    businessId: null,
    businessName: null,
    displayName: 'Developer',
  },
}

function initialSession(): SessionState {
  if (import.meta.env.DEV) {
    const stored = readStored('session', DEV_ROLE_KEY)
    const role = ROLES.find((candidate) => candidate === stored)
    if (role) return { status: 'signed_in', user: DEV_USERS[role] }
  }
  return { status: 'signed_out' }
}

interface SessionProviderProps {
  children: ReactNode
  /** For tests: start in a given state. */
  initial?: SessionState
}

export function SessionProvider({ children, initial }: SessionProviderProps) {
  const [session, setSession] = useState<SessionState>(() => initial ?? initialSession())

  const signOut = useCallback(() => {
    removeStored('session', DEV_ROLE_KEY)
    setSession({ status: 'signed_out' })
  }, [])

  const devSignIn = useCallback((role: Role) => {
    writeStored('session', DEV_ROLE_KEY, role)
    setSession({ status: 'signed_in', user: DEV_USERS[role] })
  }, [])

  const value = useMemo<SessionContextValue>(
    () => (import.meta.env.DEV ? { session, signOut, devSignIn } : { session, signOut }),
    [session, signOut, devSignIn],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
