/**
 * Stock rules: what can change an item's quantity, and how it is described.
 *
 * Quantity only ever changes together with a ledger entry (a stock movement):
 * an opening count, a sale, a void, a restock or an adjustment. So every
 * item's quantity always equals the sum of its ledger.
 */

export type MovementType = 'opening' | 'sale' | 'void' | 'restock' | 'adjustment'

export const MOVEMENT_TYPES: readonly { value: MovementType; label: string }[] = [
  { value: 'opening', label: 'Opening stock' },
  { value: 'sale', label: 'Sale' },
  { value: 'void', label: 'Void' },
  { value: 'restock', label: 'Restock' },
  { value: 'adjustment', label: 'Adjustment' },
]

export function movementTypeLabel(type: MovementType): string {
  return MOVEMENT_TYPES.find((option) => option.value === type)?.label ?? type
}

export type AdjustReason = 'damaged' | 'expired' | 'lost_or_stolen' | 'miscount' | 'other'

export const ADJUST_REASONS: readonly { value: AdjustReason; label: string }[] = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'lost_or_stolen', label: 'Lost or stolen' },
  { value: 'miscount', label: 'Miscount' },
  { value: 'other', label: 'Other' },
]

export function adjustReasonLabel(reason: AdjustReason): string {
  return ADJUST_REASONS.find((option) => option.value === reason)?.label ?? reason
}

export function isAdjustReason(value: unknown): value is AdjustReason {
  return ADJUST_REASONS.some((option) => option.value === value)
}

export const STOCK_LIMITS = {
  maxQuantity: 1_000_000_000,
  maxRestockQuantity: 1_000_000,
  maxRestockLines: 100,
  maxLowStockLevel: 1_000_000,
  maxPrice: 1_000_000_000_000,
  itemNameMax: 80,
  categoryMax: 40,
  unitMax: 20,
  supplierMax: 80,
  noteMax: 200,
  voidReasonMax: 200,
  /** How far back a delivery may be dated. */
  restockMaxAgeDays: 366,
} as const

/** "+24", "−3": always signed, so direction never depends on colour. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

/** For the adjust screen: "−3 (from 48 to 45)", or null when nothing changes. */
export function describeAdjustment(systemQuantity: number, counted: number): string | null {
  if (counted === systemQuantity) return null
  return `${formatDelta(counted - systemQuantity)} (from ${systemQuantity} to ${counted})`
}

/** One line of a delivery: an item or a shared supply (exactly one of the two). */
export interface RestockLine {
  itemId?: string
  supplyId?: string
  quantity: number
  unitCost: number | null
}

/** "item:abc" or "supply:xyz", so a line's target can be compared and looked up. */
export function stockTargetKey(line: {
  itemId?: string | undefined
  supplyId?: string | undefined
}): string {
  return line.itemId ? `item:${line.itemId}` : `supply:${line.supplyId ?? ''}`
}

/** Each item or supply once, whole quantities of at least 1, costs not negative. */
export function restockLinesProblem(
  lines: readonly RestockLine[],
): 'empty' | 'target' | 'duplicate' | 'quantity' | 'cost' | null {
  if (lines.length === 0) return 'empty'
  if (lines.some((line) => Boolean(line.itemId) === Boolean(line.supplyId))) return 'target'
  if (new Set(lines.map(stockTargetKey)).size !== lines.length) return 'duplicate'
  if (
    lines.some(
      (line) =>
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > STOCK_LIMITS.maxRestockQuantity,
    )
  ) {
    return 'quantity'
  }
  if (
    lines.some(
      (line) => line.unitCost !== null && (line.unitCost < 0 || !Number.isInteger(line.unitCost)),
    )
  ) {
    return 'cost'
  }
  return null
}

/** Value of stock at cost, for items that have a cost price. */
export function stockValue(
  items: readonly { id: string; quantity: number; active: boolean }[],
  costs: Readonly<Record<string, number>>,
): { value: number; itemsWithCost: number; itemsWithoutCost: number } {
  let value = 0
  let itemsWithCost = 0
  let itemsWithoutCost = 0
  for (const item of items) {
    if (!item.active) continue
    const cost = costs[item.id]
    if (cost === undefined) {
      itemsWithoutCost += 1
    } else {
      itemsWithCost += 1
      value += cost * item.quantity
    }
  }
  return { value, itemsWithCost, itemsWithoutCost }
}
