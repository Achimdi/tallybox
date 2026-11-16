import { cn } from '@/lib/cn'
import { stockStatus } from '@/lib/stock'
import { Money } from './Money'
import { StatusChip } from './StatusChip'

interface ItemCardProps {
  name: string
  /** Selling price in minor units. */
  price: number
  currency: string
  /**
   * How many can be sold (with what is already in the cart). For items using
   * shared supplies this is limited by the supplies. Null: not counted, no limit.
   */
  available: number | null
  lowStockLevel: number
  /** True when shared supplies limit it: the count reads "can be sold" instead of "in stock". */
  shared?: boolean
  unit?: string
  /** How many of this item are already in the cart. */
  inCart?: number
  /** Tap to add one. Leave out for a read-only card. */
  onAdd?: () => void
  className?: string
}

/** An item in the selling grid: name, price and stock. Out-of-stock items cannot be tapped. */
export function ItemCard({
  name,
  price,
  currency,
  available,
  lowStockLevel,
  shared = false,
  unit,
  inCart = 0,
  onAdd,
  className,
}: ItemCardProps) {
  const status = available === null ? null : stockStatus(available, lowStockLevel)
  const outOfStock = status === 'out_of_stock'
  const atLimit = available !== null && inCart >= available
  const readOnly = onAdd === undefined

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-body font-semibold text-ink">
          {readOnly ? null : <span className="sr-only">Add</span>} {name}
        </span>
        {inCart > 0 ? (
          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold text-grey-900 tabular-nums">
            {inCart}
            <span className="sr-only"> in cart</span>
          </span>
        ) : null}
      </span>
      <Money minor={price} currency={currency} className="text-body-lg font-bold text-ink" />
      <span className="mt-auto flex min-h-6 items-center justify-between gap-2">
        {status === null ? (
          <span className="text-label font-normal text-ink-muted">No stock count</span>
        ) : status === 'in_stock' ? (
          <span className="text-label font-normal text-ink-muted tabular-nums">
            {available} {shared ? 'can be sold' : (unit ?? 'in stock')}
          </span>
        ) : (
          <StatusChip
            status={status}
            label={outOfStock ? 'Out of stock' : `Low: ${available} left`}
          />
        )}
      </span>
    </>
  )

  const classes = cn(
    'flex min-h-32 w-full flex-col gap-1.5 rounded-card border border-line bg-surface-raised p-4 text-left shadow-soft',
    className,
  )

  if (readOnly) return <div className={classes}>{body}</div>

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={outOfStock || atLimit}
      // The visible text is the button's name ("Add Water ₦300 24 in stock"),
      // so people using voice control can say what they see (WCAG 2.5.3).
      className={cn(
        classes,
        'transition-[border-color,box-shadow,transform] duration-150',
        'enabled:hover:border-primary enabled:active:scale-[0.98]',
        outOfStock && 'cursor-not-allowed opacity-60',
        atLimit && !outOfStock && 'cursor-not-allowed',
      )}
    >
      {body}
    </button>
  )
}
