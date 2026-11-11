import { LogOut } from 'lucide-react'
import { Outlet } from 'react-router'
import { BottomNav, SideRail } from '@/components/AppNav'
import { LogoSymbol } from '@/components/brand/Logo'
import { useSession } from '@/features/auth/session'
import { PORTAL_NAV, type Portal } from '../paths'
import { PageTransition } from './PageTransition'

const PORTAL_TITLE: Record<Portal, string> = {
  staff: 'Staff',
  owner: 'Owner',
  admin: 'Tallybox admin',
}

interface PortalLayoutProps {
  portal: Portal
}

/**
 * The signed-in shell. Phone: top bar and bottom navigation. Tablet and laptop:
 * a side rail, with content centered at a comfortable maximum width.
 */
export function PortalLayout({ portal }: PortalLayoutProps) {
  const { session, signOut } = useSession()
  const items = PORTAL_NAV[portal]
  const user = session.status === 'signed_in' ? session.user : null

  return (
    <div className="min-h-dvh md:pl-24">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary px-4 py-3 text-on-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <SideRail items={items} header={<LogoSymbol className="size-10" />} />

      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface-raised">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <LogoSymbol className="size-8 md:hidden" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body leading-tight font-semibold text-ink">
              {user?.businessName ?? PORTAL_TITLE[portal]}
            </span>
            <span className="truncate text-caption text-ink-muted">
              {user ? `${user.displayName} · ${PORTAL_TITLE[portal]}` : PORTAL_TITLE[portal]}
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="flex size-12 items-center justify-center rounded-control text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </div>
      </header>

      {/* Bottom padding keeps content clear of the phone navigation bar. */}
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 md:pb-10">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>

      <BottomNav items={items} />
    </div>
  )
}
