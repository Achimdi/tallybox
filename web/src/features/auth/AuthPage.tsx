import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

interface AuthPageProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/** The shared frame of the sign-in and registration screens: back link, title, content. */
export function AuthPage({ title, subtitle, children }: AuthPageProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/"
        className="-ml-2 inline-flex min-h-12 items-center gap-1 self-start rounded-control px-2 text-label font-semibold text-primary"
      >
        <ChevronLeft aria-hidden="true" className="size-5" />
        Back
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-title-lg text-ink">{title}</h1>
        {subtitle ? <p className="text-body text-ink-muted">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  )
}
