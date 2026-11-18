import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/brand/Logo'
import { APP_VERSION } from '@/lib/version'

/**
 * The frame of the public reading pages (privacy, support): the logo back to
 * the front page, a readable column, and the same small footer links.
 */
export function DocumentPage({
  title,
  intro,
  children,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-line/70">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center px-4 sm:px-6">
          <Link to="/" aria-label="Tallybox home" className="rounded-control">
            <Logo size="sm" />
          </Link>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6"
      >
        <header className="flex flex-col gap-2">
          <h1 className="text-title-lg text-ink">{title}</h1>
          {intro ? <div className="text-body text-ink-muted">{intro}</div> : null}
        </header>
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-5 text-caption text-ink-muted sm:px-6">
          <span className="tabular-nums">
            © {new Date().getFullYear()} Tallybox · v{APP_VERSION}
          </span>
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          <Link to="/support" className="hover:text-ink">
            Support
          </Link>
          <Link to="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  )
}

/** A titled part of a reading page. */
export function DocumentSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-title text-ink">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-body text-ink-muted [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_li]:pl-1 [&_strong]:text-ink [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  )
}
