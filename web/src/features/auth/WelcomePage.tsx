import { lazy, Suspense } from 'react'
import { LogoSymbol } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/Button'
import { InstallHint } from '@/components/InstallHint'

// Development-only role preview. This import is removed from production builds.
const DevRolePreview = import.meta.env.DEV
  ? lazy(() => import('@/features/dev/DevRolePreview'))
  : null

/** The first screen: register a business, or sign in as owner or staff. */
export function WelcomePage() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <LogoSymbol className="size-20" />
        <div className="flex flex-col gap-1">
          <h1 className="text-display text-ink">Tallybox</h1>
          <p className="text-body-lg text-ink-muted">Stock and sales for your business.</p>
        </div>
      </header>

      <nav aria-label="Get started" className="flex flex-col gap-3">
        <ButtonLink to="/register" size="lg" fullWidth>
          Register your business
        </ButtonLink>
        <ButtonLink to="/login/owner" variant="secondary" size="lg" fullWidth>
          Owner login
        </ButtonLink>
        <ButtonLink to="/login/staff" variant="secondary" size="lg" fullWidth>
          Staff login
        </ButtonLink>
      </nav>

      <InstallHint />

      {DevRolePreview ? (
        <Suspense fallback={null}>
          <DevRolePreview />
        </Suspense>
      ) : null}
    </div>
  )
}
