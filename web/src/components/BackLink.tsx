import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

/** The "‹ Back" link at the top of a screen below the main tabs. */
export function BackLink({ to, label = 'Back' }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="-ml-2 inline-flex min-h-12 items-center gap-1 self-start rounded-control px-2 text-label font-semibold text-primary"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {label}
    </Link>
  )
}
