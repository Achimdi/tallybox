import { FlaskConical } from 'lucide-react'
import { Link } from 'react-router'
import { useApi } from '@/api/context'
import { LogoSymbol } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/Button'
import { InstallHint } from '@/components/InstallHint'
import { ResetDemoData } from '@/features/demo/ResetDemoData'

/** The first screen: register a business, or sign in as owner or staff. */
export function WelcomePage() {
  const api = useApi()
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

      {api.demo ? (
        <aside
          aria-labelledby="demo-title"
          className="flex flex-col gap-3 rounded-card border border-dashed border-line-control p-4"
        >
          <div className="flex flex-col gap-1">
            <p id="demo-title" className="flex items-center gap-2 text-label text-ink">
              <FlaskConical aria-hidden="true" className="size-4" />
              This is a demo
            </p>
            <p className="text-label font-normal text-ink-muted">
              Everything is made up and stays in this browser. The login pages list demo accounts
              for the developer, an owner and staff.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ResetDemoData />
            {import.meta.env.DEV ? (
              <Link to="/dev/gallery" className="text-label font-semibold text-primary underline">
                Design gallery
              </Link>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
