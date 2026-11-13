import { Navigate, Outlet } from 'react-router'
import { TallyLoader } from '@/components/brand/TallyLoader'
import { useSession, type BlockedNotice, type Role } from '@/features/auth/session'
import { NotFoundPage } from './pages/NotFoundPage'
import { PermissionDeniedPage } from './pages/PermissionDeniedPage'
import { homePathFor } from './paths'

/**
 * Route guards decide which SCREENS a role can open. They are a convenience,
 * not security: in Phase 2 the database decides which DATA anyone can read,
 * and server functions decide who can change anything.
 */

/** Where someone goes after being signed out because of a block. */
export function blockedPath(notice: BlockedNotice): string {
  return notice.reason === 'access_ended' ? '/access-ended' : '/suspended'
}

interface RequireRoleProps {
  allow: readonly Role[]
  /**
   * Hidden areas (the developer portal) answer with the ordinary "page not
   * found" screen for everyone else, so the URL gives nothing away.
   */
  hidden?: boolean
}

export function RequireRole({ allow, hidden = false }: RequireRoleProps) {
  const { session, blocked } = useSession()

  if (session.status === 'loading') return <TallyLoader fullPage />

  if (session.status === 'signed_out') {
    if (hidden) return <NotFoundPage />
    return <Navigate to={blocked ? blockedPath(blocked) : '/'} replace />
  }

  if (!allow.includes(session.user.role)) {
    return hidden ? <NotFoundPage /> : <PermissionDeniedPage />
  }

  return <Outlet />
}

/** Welcome, login and registration: signed-in people are sent to their own home. */
export function PublicOnly() {
  const { session, blocked } = useSession()

  if (session.status === 'loading') return <TallyLoader fullPage />
  if (session.status === 'signed_in') {
    return <Navigate to={homePathFor(session.user.role)} replace />
  }
  if (blocked) return <Navigate to={blockedPath(blocked)} replace />
  return <Outlet />
}
