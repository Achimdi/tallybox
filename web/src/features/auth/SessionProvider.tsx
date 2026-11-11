import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isSupabaseConfigured } from '@/lib/env'
import { AppError, toAppError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { readStored, removeStored, writeStored } from '@/lib/storage'
import { getSupabase } from '@/lib/supabase'
import {
  fetchSessionState,
  hasStoredSession,
  signInThroughPortal,
  signOutHere,
} from './authService'
import {
  SessionContext,
  type BlockedNotice,
  type Role,
  type SessionContextValue,
  type SessionState,
  type SessionUser,
  type SignInInput,
} from './session'
import type { InterpretedSession } from './sessionState'

/**
 * Holds who is signed in, and keeps that honest.
 *
 * Supabase keeps the session in the browser and refreshes it by itself. On top
 * of that, this provider asks the DATABASE who the person is: on start, after
 * sign-in, whenever the tab regains focus and when the network comes back. If
 * the business was suspended or the account turned off in the meantime, the
 * person is signed out and sent to the suspended screen.
 *
 * This decides which SCREENS show. It is not security: Row Level Security in
 * the database refuses the data regardless of what the browser thinks.
 */

/** Do not re-ask the database more often than this on focus changes. */
const RECHECK_MIN_GAP_MS = 5000

// --- Development-only layout preview (when Supabase is not configured) -------

const DEV_ROLE_KEY = 'tb.dev.role'
const ROLES: readonly Role[] = ['super_admin', 'owner', 'staff']

function devUser(role: Role): SessionUser {
  const inBusiness = role !== 'super_admin'
  return {
    id: `dev-${role}`,
    role,
    displayName:
      role === 'super_admin' ? 'Developer' : role === 'owner' ? 'Demo Owner' : 'Demo Staff',
    username: role === 'staff' ? 'demo' : null,
    businessId: inBusiness ? 'dev-business' : null,
    businessName: inBusiness ? 'Demo Shop' : null,
    businessCode: inBusiness ? 'demo-shop' : null,
    currencyCode: inBusiness ? 'NGN' : null,
    timezone: inBusiness ? 'Africa/Lagos' : null,
  }
}

const devPreviewAvailable = import.meta.env.DEV && !isSupabaseConfigured

function initialSession(live: boolean): SessionState {
  if (live) return { status: 'loading' }
  if (devPreviewAvailable) {
    const stored = readStored('session', DEV_ROLE_KEY)
    const role = ROLES.find((candidate) => candidate === stored)
    if (role) return { status: 'signed_in', user: devUser(role) }
  }
  return { status: 'signed_out' }
}

// -----------------------------------------------------------------------------

interface SessionProviderProps {
  children: ReactNode
  /** For tests: start in a given state and never contact Supabase. */
  initial?: SessionState
  /** For tests: start with a blocked notice. */
  initialBlocked?: BlockedNotice
}

export function SessionProvider({ children, initial, initialBlocked }: SessionProviderProps) {
  const live = initial === undefined && isSupabaseConfigured
  const [session, setSession] = useState<SessionState>(() => initial ?? initialSession(live))
  const [blocked, setBlocked] = useState<BlockedNotice | null>(initialBlocked ?? null)
  const signingIn = useRef(false)
  const lastCheck = useRef(0)

  const apply = useCallback((result: InterpretedSession) => {
    if (result.kind === 'blocked') {
      setBlocked(result.notice)
      setSession({ status: 'signed_out' })
    } else {
      setSession({ status: 'signed_in', user: result.user })
    }
  }, [])

  /** Asks the database again who this is. Safe to call often. */
  const recheck = useCallback(
    async (force: boolean) => {
      if (!live || signingIn.current) return
      const now = Date.now()
      if (!force && now - lastCheck.current < RECHECK_MIN_GAP_MS) return
      lastCheck.current = now

      try {
        if (!(await hasStoredSession())) {
          setSession({ status: 'signed_out' })
          return
        }
        const result = await fetchSessionState(false)
        if (result.kind === 'blocked') await signOutHere()
        apply(result)
      } catch (error) {
        const appError = toAppError(error)
        if (appError.code === 'unauthenticated') {
          await signOutHere()
          setSession({ status: 'signed_out' })
          return
        }
        logger.warn('session_check_failed', { code: appError.code })
        // Offline or a server hiccup: keep whoever was signed in as they were.
        // On a cold start there is nobody yet, so show the welcome screen. The
        // stored session is kept and is picked up again when the network returns.
        setSession((current) => (current.status === 'loading' ? { status: 'signed_out' } : current))
      }
    },
    [live, apply],
  )

  useEffect(() => {
    if (!live) return

    // Supabase reports INITIAL_SESSION as soon as it has read the stored
    // session, which is the moment to ask the database who this is.
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession({ status: 'signed_out' })
      } else if (
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        // Supabase asks that nothing else is awaited inside this callback.
        window.setTimeout(() => void recheck(true), 0)
      }
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') void recheck(false)
    }
    const onOnline = () => void recheck(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      data.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [live, recheck])

  const signIn = useCallback(
    async (input: SignInInput) => {
      if (!live) throw new AppError('config_missing')
      signingIn.current = true
      try {
        const result = await signInThroughPortal(input)
        lastCheck.current = Date.now()
        if (result.kind === 'blocked') {
          apply(result)
          throw new AppError(
            result.notice.reason === 'disabled' ? 'account_disabled' : 'business_suspended',
          )
        }
        setBlocked(null)
        apply(result)
      } finally {
        signingIn.current = false
      }
    },
    [live, apply],
  )

  const signOut = useCallback(() => {
    removeStored('session', DEV_ROLE_KEY)
    setSession({ status: 'signed_out' })
    if (live) void signOutHere()
  }, [live])

  const clearBlocked = useCallback(() => setBlocked(null), [])

  const devSignIn = useCallback((role: Role) => {
    writeStored('session', DEV_ROLE_KEY, role)
    setSession({ status: 'signed_in', user: devUser(role) })
  }, [])

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      blocked,
      clearBlocked,
      signIn,
      signOut,
      ...(devPreviewAvailable && initial === undefined ? { devSignIn } : {}),
    }),
    [session, blocked, clearBlocked, signIn, signOut, devSignIn, initial],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
