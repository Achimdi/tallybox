import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApi } from '@/api/context'
import type { BlockedNotice, SessionResult } from '@/api/types'
import { AppError, toAppError, type AppErrorCode } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  SessionContext,
  type SessionContextValue,
  type SessionState,
  type SignInInput,
} from './session'

/**
 * Holds who is signed in, and keeps that honest.
 *
 * The data layer is asked who the person is on start, after sign-in, whenever
 * the tab regains focus and when the network comes back. If the business was
 * suspended, its access ended, or the account was turned off in the meantime,
 * the person is signed out and sent to the right screen.
 *
 * This decides which SCREENS show. It is not security: in Phase 2 the
 * database refuses the data regardless of what the browser thinks.
 */

/** Do not re-ask more often than this on focus changes. */
const RECHECK_MIN_GAP_MS = 5000

const BLOCKED_ERROR: Record<BlockedNotice['reason'], AppErrorCode> = {
  suspended: 'business_suspended',
  access_ended: 'access_ended',
  disabled: 'account_disabled',
  no_profile: 'permission_denied',
}

interface SessionProviderProps {
  children: ReactNode
  /** For tests: start in a given state and skip the first check. */
  initial?: SessionState
  /** For tests: start with a blocked notice. */
  initialBlocked?: BlockedNotice
}

export function SessionProvider({ children, initial, initialBlocked }: SessionProviderProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [session, setSession] = useState<SessionState>(() => initial ?? { status: 'loading' })
  const [blocked, setBlocked] = useState<BlockedNotice | null>(initialBlocked ?? null)
  const busy = useRef(false)
  const lastCheck = useRef(0)

  const apply = useCallback((result: SessionResult | null) => {
    if (result === null) {
      setSession({ status: 'signed_out' })
    } else if (result.kind === 'blocked') {
      setBlocked(result.notice)
      setSession({ status: 'signed_out' })
    } else {
      setSession({ status: 'signed_in', user: result.user })
    }
  }, [])

  /** Asks again who this is. Safe to call often. */
  const recheck = useCallback(
    async (force: boolean) => {
      if (busy.current) return
      const now = Date.now()
      if (!force && now - lastCheck.current < RECHECK_MIN_GAP_MS) return
      lastCheck.current = now
      try {
        apply(await api.auth.getSession())
      } catch (error) {
        const appError = toAppError(error)
        logger.warn('session_check_failed', { code: appError.code })
        // Offline or a hiccup: keep whoever was signed in as they were. On a
        // cold start there is nobody yet, so show the welcome screen.
        setSession((current) => (current.status === 'loading' ? { status: 'signed_out' } : current))
      }
    },
    [api, apply],
  )

  useEffect(() => {
    // The first check, deferred a tick so it never updates state during render
    // (and runs once, even when React mounts effects twice in development).
    const firstCheck =
      initial === undefined ? window.setTimeout(() => void recheck(true), 0) : undefined

    const onVisible = () => {
      if (document.visibilityState === 'visible') void recheck(false)
    }
    const onOnline = () => void recheck(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      window.clearTimeout(firstCheck)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [initial, recheck])

  const signIn = useCallback(
    async (input: SignInInput) => {
      busy.current = true
      try {
        const result = await api.auth.signIn(input)
        lastCheck.current = Date.now()
        // Nothing read for the previous person may show for the next one.
        queryClient.clear()
        apply(result)
        if (result.kind === 'blocked') throw new AppError(BLOCKED_ERROR[result.notice.reason])
        setBlocked(null)
      } finally {
        busy.current = false
      }
    },
    [api, apply, queryClient],
  )

  const signOut = useCallback(() => {
    setSession({ status: 'signed_out' })
    queryClient.clear()
    void api.auth.signOut().catch(() => undefined)
  }, [api, queryClient])

  const clearBlocked = useCallback(() => setBlocked(null), [])

  const value = useMemo<SessionContextValue>(
    () => ({ session, blocked, clearBlocked, signIn, signOut }),
    [session, blocked, clearBlocked, signIn, signOut],
  )

  return <SessionContext value={value}>{children}</SessionContext>
}
