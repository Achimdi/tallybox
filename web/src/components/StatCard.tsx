import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface StatTrend {
  direction: 'up' | 'down' | 'flat'
  /** For example "12% vs yesterday". */
  label: string
}

interface StatCardProps {
  label: string
  /** Already formatted, for example a <Money /> or "24". */
  value: ReactNode
  icon?: LucideIcon
  trend?: StatTrend
  className?: string
}

const TREND = {
  up: { icon: TrendingUp, className: 'text-success', word: 'Up' },
  down: { icon: TrendingDown, className: 'text-error-strong', word: 'Down' },
  flat: { icon: Minus, className: 'text-ink-muted', word: 'No change' },
} as const

/** One headline number on the dashboard. */
export function StatCard({ label, value, icon: Icon, trend, className }: StatCardProps) {
  const trendStyle = trend ? TREND[trend.direction] : null
  const TrendIcon = trendStyle?.icon
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-card border border-line bg-surface-raised p-4 shadow-soft',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-ink-muted">
        <span className="text-label">{label}</span>
        {Icon ? <Icon aria-hidden="true" className="size-5" /> : null}
      </div>
      <div className="text-title-lg text-ink tabular-nums">{value}</div>
      {trend && trendStyle && TrendIcon ? (
        <div className={cn('flex items-center gap-1 text-label', trendStyle.className)}>
          <TrendIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{trendStyle.word}: </span>
          <span className="tabular-nums">{trend.label}</span>
        </div>
      ) : null}
    </div>
  )
}
