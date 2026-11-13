import {
  Ban,
  CalendarClock,
  CalendarX,
  Infinity as InfinityIcon,
  Check,
  CircleCheck,
  Clock,
  PackageX,
  TriangleExclamationPoint,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

export type ChipStatus =
  // Orders
  | 'completed'
  | 'voided'
  | 'held'
  // Stock
  | 'in_stock'
  | 'low_stock'
  | 'out_of_stock'
  // Businesses and accounts
  | 'active'
  | 'suspended'
  // Access periods
  | 'ending_soon'
  | 'access_ended'
  | 'open_ended'
  // Activation codes
  | 'unused'
  | 'used'
  | 'revoked'
  | 'expired'

interface ChipStyle {
  label: string
  icon: LucideIcon
  className: string
}

const GOOD = 'bg-success-soft text-success'
const BAD = 'bg-error-soft text-error-strong'
const WAITING = 'bg-info-soft text-info'
const CAUTION = 'bg-warning-soft text-warning'

// Every status has a color AND an icon AND a word, never color alone.
const STYLES: Record<ChipStatus, ChipStyle> = {
  completed: { label: 'Completed', icon: CircleCheck, className: GOOD },
  voided: { label: 'Voided', icon: Ban, className: BAD },
  held: { label: 'Held', icon: Clock, className: WAITING },
  in_stock: { label: 'In stock', icon: Check, className: GOOD },
  low_stock: { label: 'Low stock', icon: TriangleExclamationPoint, className: CAUTION },
  out_of_stock: { label: 'Out of stock', icon: PackageX, className: BAD },
  active: { label: 'Active', icon: Check, className: GOOD },
  suspended: { label: 'Suspended', icon: Ban, className: BAD },
  ending_soon: { label: 'Ending soon', icon: CalendarClock, className: CAUTION },
  access_ended: { label: 'Access ended', icon: CalendarX, className: BAD },
  open_ended: { label: 'Open-ended', icon: InfinityIcon, className: GOOD },
  unused: { label: 'Unused', icon: Clock, className: WAITING },
  used: { label: 'Used', icon: CircleCheck, className: GOOD },
  revoked: { label: 'Revoked', icon: Ban, className: BAD },
  expired: { label: 'Expired', icon: TriangleExclamationPoint, className: CAUTION },
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
