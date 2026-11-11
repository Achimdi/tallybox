import { ChevronRight, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Money } from './Money'

interface CartBarProps {
  itemCount: number
  /** Running total in minor units. */
  total: number
  currency: string
  onOpen: () => void
  className?: string
}

/** The bar at the bottom of the selling screen: item count, total, tap to open the cart. */
export function CartBar({ itemCount, total, currency, onOpen, className }: CartBarProps) {
  if (itemCount === 0) return null
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-card bg-primary px-4 text-on-primary shadow-raised',
        'transition-colors duration-150 hover:bg-primary-hover active:bg-primary-pressed',
        className,
      )}
    >
      <ShoppingCart aria-hidden="true" className="size-5 shrink-0" />
      <span className="text-body font-semibold tabular-nums">
        {itemCount} {itemCount === 1 ? 'item' : 'items'}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Money minor={total} currency={currency} className="text-body-lg font-bold" />
        <ChevronRight aria-hidden="true" className="size-5" />
      </span>
      <span className="sr-only">View cart</span>
    </button>
  )
}
