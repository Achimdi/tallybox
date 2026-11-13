import {
  CircleCheck,
  CircleExclamationPoint,
  Info,
  TriangleExclamationPoint,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { userMessage } from '@/lib/errors'

type BannerTone = 'error' | 'warning' | 'success' | 'info'

const TONES: Record<BannerTone, { icon: LucideIcon; className: string }> = {
  error: {
    icon: CircleExclamationPoint,
    className: 'border-error bg-error-soft text-error-strong',
  },
  warning: {
    icon: TriangleExclamationPoint,
    className: 'border-warning bg-warning-soft text-warning',
  },
  success: { icon: CircleCheck, className: 'border-success bg-success-soft text-success' },
  info: { icon: Info, className: 'border-info bg-info-soft text-info' },
}

interface BannerProps {
  tone: BannerTone
  title: string
  description?: string
  /** A link or button that helps with what the banner says. */
  action?: ReactNode
  className?: string
}

/** A message that stays on the page, for example above a form. */
export function Banner({ tone, title, description, action, className }: BannerProps) {
  const { icon: Icon, className: toneClass } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-control border p-4', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-body font-semibold">{title}</p>
        {description ? <p className="text-label font-normal text-ink">{description}</p> : null}
        {action ? <div className="text-label">{action}</div> : null}
      </div>
    </div>
  )
}

interface ErrorBannerProps {
  /** Any thrown value. Shown as its friendly message, never raw. */
  error: unknown
  action?: ReactNode
  className?: string
}

/** Shows why something failed and what to do next. Renders nothing when there is no error. */
export function ErrorBanner({ error, action, className }: ErrorBannerProps) {
  if (!error) return null
  const message = userMessage(error)
  return (
    <Banner
      tone="error"
      title={message.title}
      description={message.description}
      action={action}
      {...(className ? { className } : {})}
    />
  )
}
