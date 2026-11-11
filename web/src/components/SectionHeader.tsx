import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SectionHeaderProps {
  title: string
  /** Optional link or button on the right, for example "See all". */
  action?: ReactNode
  className?: string
}

export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex min-h-10 items-center justify-between gap-3', className)}>
      <h2 className="text-title text-ink">{title}</h2>
      {action}
    </div>
  )
}
