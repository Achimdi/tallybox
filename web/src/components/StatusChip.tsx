import {
  Ban,
  Check,
  CircleCheck,
  Clock,
  PackageX,
  TriangleExclamationPoint,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export type ChipStatus = 'completed' | 'voided' | 'held' | 'in_stock' | 'low_stock' | 'out_of_stock'

interface ChipStyle {
  label: string
  icon: LucideIcon
  className: string
}

// Every status has a color AND an icon AND a word, never color alone.
const STYLES: Record<ChipStatus, ChipStyle> = {
  completed: { label: 'Completed', icon: CircleCheck, className: 'bg-success-soft text-success' },
  voided: { label: 'Voided', icon: Ban, className: 'bg-error-soft text-error-strong' },
  held: { label: 'Held', icon: Clock, className: 'bg-info-soft text-info' },
  in_stock: { label: 'In stock', icon: Check, className: 'bg-success-soft text-success' },
  low_stock: {
    label: 'Low stock',
    icon: TriangleExclamationPoint,
    className: 'bg-warning-soft text-warning',
  },
  out_of_stock: {
    label: 'Out of stock',
    icon: PackageX,
    className: 'bg-error-soft text-error-strong',
  },
}

interface StatusChipProps {
  status: ChipStatus
  /** Replace the default wording, for example "3 left". */
  label?: string
  className?: string
}

export function StatusChip({ status, label, className }: StatusChipProps) {
  const style = STYLES[status]
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold whitespace-nowrap',
        style.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label ?? style.label}
    </span>
  )
}
