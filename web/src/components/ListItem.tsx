import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

interface ListItemProps {
  title: ReactNode
  subtitle?: ReactNode
  /** Left side: an icon or avatar. */
  leading?: ReactNode
  /** Right side: an amount, a chip, a count. */
  trailing?: ReactNode
  /** Makes the row a link. */
  to?: string
  /** Makes the row a button. */
  onClick?: () => void
  className?: string
}

/** One row in a list. Becomes a link or a button when `to` or `onClick` is given. */
export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  to,
  onClick,
  className,
}: ListItemProps) {
  const interactive = to !== undefined || onClick !== undefined
  const classes = cn(
    'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left',
    interactive && 'transition-colors duration-150 hover:bg-surface-sunken active:bg-line',
    className,
  )
  const content = (
    <>
      {leading ? (
        <span className="flex shrink-0 items-center text-ink-muted">{leading}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body font-medium text-ink">{title}</span>
        {subtitle ? (
          <span className="truncate text-label font-normal text-ink-muted">{subtitle}</span>
        ) : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center gap-2">{trailing}</span> : null}
      {interactive ? (
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-subtle" />
      ) : null}
    </>
  )

  if (to !== undefined) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }
  if (onClick !== undefined) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    )
  }
  return <div className={classes}>{content}</div>
}

/** A card that wraps ListItems and draws the dividers between them. */
export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised shadow-soft',
        className,
      )}
    >
      {children}
    </div>
  )
}
