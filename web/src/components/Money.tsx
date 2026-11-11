import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'

interface MoneyProps {
  /** Amount in minor units (kobo, cents). */
  minor: number
  currency: string
  className?: string
}

/** A money amount in the business currency, with tabular numerals so columns line up. */
export function Money({ minor, currency, className }: MoneyProps) {
  return <span className={cn('tabular-nums', className)}>{formatMoney(minor, currency)}</span>
}
