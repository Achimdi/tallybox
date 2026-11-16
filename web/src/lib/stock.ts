export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

/**
 * How an item's stock level should be shown.
 * "Low" means at or below the item's low-stock level, but not zero.
 */
export function stockStatus(quantity: number, lowStockLevel: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock'
  if (quantity <= lowStockLevel) return 'low_stock'
  return 'in_stock'
}

/**
 * How many of an item can be sold, in words, for lists and chips.
 * Own stock reads "24 in stock"; when shared supplies limit it, "964 can be sold".
 * Items that count nothing have no status.
 */
export function availabilityLabel(item: {
  available: number | null
  lowStockLevel: number
  supplies: readonly unknown[]
}): { status: StockStatus | null; label: string } {
  if (item.available === null) return { status: null, label: 'No stock count' }
  const status = stockStatus(item.available, item.lowStockLevel)
  if (status === 'out_of_stock') return { status, label: 'Out of stock' }
  if (status === 'low_stock') return { status, label: `Low: ${item.available} left` }
  return {
    status,
    label:
      item.supplies.length > 0 ? `${item.available} can be sold` : `${item.available} in stock`,
  }
}
