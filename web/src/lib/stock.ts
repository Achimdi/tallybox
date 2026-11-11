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
