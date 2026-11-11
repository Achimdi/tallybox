import { Navigate, Outlet } from 'react-router'
import { TallyLoader } from '@/components/brand/TallyLoader'
import { useSession, type Role } from '@/features/auth/session'
import { NotFoundPage } from './pages/NotFoundPage'
import { PermissionDeniedPage } from './pages/PermissionDeniedPage'
import { homePathFor } from './paths'

/**
 * Route guards decide which SCREENS a role can open. They are a convenience,
 * not security: the database (Row Level Security) decides which DATA anyone can
 * read, and server functions decide who can change anything.
 */

interface RequireRoleProps {
  allow: readonly Role[]
  /**
   * Hidden areas (the super-admin area) answer with the ordinary "page not
   * found" screen for everyone else, so the URL gives nothing away.
   */
  hidden?: boolean
}

export function RequireRole({ allow, hidden = false }: RequireRoleProps) {
  const { session, blocked } = useSession()

  if (session.status === 'loading') return <TallyLoader fullPage />

  if (session.status === 'signed_out') {
    if (hidden) return <NotFoundPage />
    // Signed out because the business was suspended or the account turned off.
    return <Navigate to={blocked ? '/suspended' : '/'} replace />
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
  if (blocked) return <Navigate to="/suspended" replace />
  return <Outlet />
}
