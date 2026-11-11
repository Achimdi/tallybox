import { Lock, RefreshCw, TriangleExclamationPoint } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { userMessage } from '@/lib/errors'
import { TallyMark } from './brand/TallyMark'
import { Button } from './Button'

/**
 * The four states every screen must handle, besides its normal content:
 * loading (TallyLoader or Skeleton), empty, error and permission denied.
 */

/** Use 1 when the state IS the page (for example "Page not found"), 2 inside a page. */
type HeadingLevel = 1 | 2

interface StateShellProps {
  icon: ReactNode
  title: string
  description?: string | undefined
  action?: ReactNode
  className?: string | undefined
  role?: 'alert'
  headingLevel?: HeadingLevel | undefined
}

function StateShell({
  icon,
  title,
  description,
  action,
  className,
  role,
  headingLevel = 2,
}: StateShellProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div
      role={role}
      className={cn('flex flex-col items-center gap-3 px-6 py-12 text-center', className)}
    >
      {icon}
      <Heading className="text-title text-ink">{title}</Heading>
      {description ? <p className="max-w-sm text-body text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  /** Usually one button that fixes the emptiness, for example "Add item". */
  action?: ReactNode
  headingLevel?: HeadingLevel
  className?: string
}

/** Nothing here yet. Friendly, with the tally motif. */
export function EmptyState({
  title,
  description,
  action,
  headingLevel,
  className,
}: EmptyStateProps) {
  return (
    <StateShell
      icon={<TallyMark className="h-12 w-14 text-line-control" />}
      title={title}
      description={description}
      action={action}
      headingLevel={headingLevel}
      className={className}
    />
  )
}

interface ErrorStateProps {
  /** Any thrown value. It is turned into a friendly message, never shown raw. */
  error?: unknown
  /** Override the message when the screen can be more specific. */
  title?: string
  description?: string
  onRetry?: () => void
  headingLevel?: HeadingLevel
  className?: string
}

/** Something failed. Says what happened and what to do next. */
export function ErrorState({
  error,
  title,
  description,
  onRetry,
  headingLevel,
  className,
}: ErrorStateProps) {
  const message = userMessage(error)
  return (
    <StateShell
      role="alert"
      icon={
        <span className="flex size-14 items-center justify-center rounded-full bg-error-soft text-error-strong">
          <TriangleExclamationPoint aria-hidden="true" className="size-7" />
        </span>
      }
      title={title ?? message.title}
      description={description ?? message.description}
      action={
        onRetry ? (
          <Button
            variant="secondary"
            onClick={onRetry}
            leadingIcon={<RefreshCw aria-hidden="true" className="size-5" />}
          >
            Try again
          </Button>
        ) : undefined
      }
      headingLevel={headingLevel}
      className={className}
    />
  )
}

interface PermissionDeniedProps {
  title?: string
  description?: string
  action?: ReactNode
  headingLevel?: HeadingLevel
  className?: string
}

/** The signed-in person is not allowed to see this. */
export function PermissionDenied({
  title = "You don't have access to this",
  description = 'Ask the business owner if you think you should.',
  action,
  headingLevel,
  className,
}: PermissionDeniedProps) {
  return (
    <StateShell
      icon={
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
          <Lock aria-hidden="true" className="size-7" />
        </span>
      }
      title={title}
      description={description}
      action={action}
      headingLevel={headingLevel}
      className={className}
    />
  )
}
