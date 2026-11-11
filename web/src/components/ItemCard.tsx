import { cn } from '@/lib/cn'
import { stockStatus } from '@/lib/stock'
import { Money } from './Money'
import { StatusChip } from './StatusChip'

interface ItemCardProps {
  name: string
  /** Selling price in minor units. */
  price: number
  currency: string
  /** Stock on hand. */
  quantity: number
  lowStockLevel: number
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
  quantity,
  lowStockLevel,
  unit,
  inCart = 0,
  onAdd,
  className,
}: ItemCardProps) {
  const status = stockStatus(quantity, lowStockLevel)
  const outOfStock = status === 'out_of_stock'
  const atLimit = inCart >= quantity
  const readOnly = onAdd === undefined

  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-body font-semibold text-ink">{name}</span>
        {inCart > 0 ? (
          <span
            aria-label={`${inCart} in cart`}
            className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-caption font-bold text-grey-900 tabular-nums"
          >
            {inCart}
          </span>
        ) : null}
      </span>
      <Money minor={price} currency={currency} className="text-body-lg font-bold text-ink" />
      <span className="mt-auto flex min-h-6 items-center justify-between gap-2">
        {status === 'in_stock' ? (
          <span className="text-label font-normal text-ink-muted tabular-nums">
            {quantity} {unit ?? 'in stock'}
          </span>
        ) : (
          <StatusChip
            status={status}
            label={outOfStock ? 'Out of stock' : `Low: ${quantity} left`}
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
      aria-label={`Add ${name}`}
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
