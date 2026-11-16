import type { Item } from '@/api/types'
import { StatusChip } from '@/components/StatusChip'
import { availabilityLabel } from '@/lib/stock'

/**
 * How many of an item can be sold: plain text when all is well, a chip with an
 * icon when stock is low or out (so status never relies on colour alone).
 */
export function StockLabel({
  item,
  chip = false,
}: {
  item: Pick<Item, 'available' | 'lowStockLevel' | 'supplies'>
  chip?: boolean
}) {
  const { status, label } = availabilityLabel(item)
  if (status === 'low_stock' || status === 'out_of_stock' || (chip && status === 'in_stock')) {
    return <StatusChip status={status} label={label} />
  }
  return <span className="text-label font-normal text-ink-muted tabular-nums">{label}</span>
}
