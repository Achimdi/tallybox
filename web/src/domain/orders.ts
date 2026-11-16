/**
 * Order rules, shared by the screens, the mock data layer and (in Phase 2)
 * the database. Pure functions: no storage, no clock.
 *
 * The big rules:
 *   - An order is confirmed only after "Payment received" is ticked.
 *   - Names and prices come from the item list at the moment of confirming,
 *     never from the cart, and are copied onto the order (a snapshot), so a
 *     later price change never rewrites an old receipt.
 *   - Stock is checked per item when confirming. A held order takes no stock.
 *   - Items that use shared supplies are checked against the supplies too, with
 *     every line's needs added up first (10 Coke + 10 Fanta need 20 bottles).
 */

import {
  supplyDeductions,
  supplyProblems,
  type SellableFacts,
  type SupplyDeduction,
  type SupplyFacts,
  type SupplyProblem,
} from './supplies'

export type PaymentMethod = 'cash' | 'bank_transfer' | 'card'

export const PAYMENT_METHODS: readonly { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card machine' },
]

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((option) => option.value === method)?.label ?? method
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.some((option) => option.value === value)
}

export const ORDER_LIMITS = {
  maxLines: 100,
  maxQuantity: 10_000,
  customerNameMax: 80,
  customerPhoneMax: 30,
  paymentReferenceMax: 60,
  noteMax: 200,
} as const

export interface CartLine {
  itemId: string
  quantity: number
}

/**
 * Merges repeated items, drops empty lines, keeps the first-added order.
 * Returns null if any quantity is not a whole number in range.
 */
export function normalizeCart(lines: readonly CartLine[]): CartLine[] | null {
  const merged = new Map<string, number>()
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0) return null
    if (line.quantity === 0) continue
    merged.set(line.itemId, (merged.get(line.itemId) ?? 0) + line.quantity)
  }
  const result = [...merged].map(([itemId, quantity]) => ({ itemId, quantity }))
  if (result.some((line) => line.quantity > ORDER_LIMITS.maxQuantity)) return null
  if (result.length > ORDER_LIMITS.maxLines) return null
  return result
}

/** What the order needs to know about an item at the moment of confirming. */
export interface StockFacts extends SellableFacts {
  price: number
  active: boolean
}

export interface PricedLine {
  itemId: string
  name: string
  unitPrice: number
  quantity: number
  lineTotal: number
}

/** An item that counts its own stock and has too little of it. */
export interface StockProblem {
  itemId: string
  name: string
  available: number
  requested: number
}

export type OrderCheck =
  | { ok: true; lines: PricedLine[]; total: number; supplyDeductions: SupplyDeduction[] }
  | { ok: false; reason: 'item_unavailable'; names: string[] }
  | {
      ok: false
      reason: 'insufficient_stock'
      problems: StockProblem[]
      supplyProblems: SupplyProblem[]
    }

/**
 * Prices the cart from current item data and checks stock: each item's own
 * stock (if it counts it) and every shared supply, all lines added up.
 */
export function checkOrder(
  lines: readonly CartLine[],
  itemsById: ReadonlyMap<string, StockFacts>,
  suppliesById: ReadonlyMap<string, SupplyFacts> = new Map(),
): OrderCheck {
  const unavailable: string[] = []
  const problems: StockProblem[] = []
  const priced: PricedLine[] = []

  for (const line of lines) {
    const item = itemsById.get(line.itemId)
    if (!item || !item.active) {
      unavailable.push(item?.name ?? 'An item')
      continue
    }
    if (item.tracksOwnStock && line.quantity > item.quantity) {
      problems.push({
        itemId: item.id,
        name: item.name,
        available: Math.max(0, item.quantity),
        requested: line.quantity,
      })
    }
    priced.push({
      itemId: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: line.quantity,
      lineTotal: item.price * line.quantity,
    })
  }

  if (unavailable.length > 0) return { ok: false, reason: 'item_unavailable', names: unavailable }
  const short = supplyProblems(lines, itemsById, suppliesById)
  if (problems.length > 0 || short.length > 0) {
    return { ok: false, reason: 'insufficient_stock', problems, supplyProblems: short }
  }
  return {
    ok: true,
    lines: priced,
    total: priced.reduce((sum, line) => sum + line.lineTotal, 0),
    supplyDeductions: supplyDeductions(lines, itemsById),
  }
}

/** "#0042". Order numbers count up per business. */
export function formatOrderNumber(orderNumber: number): string {
  return `#${String(orderNumber).padStart(4, '0')}`
}

/** "Not enough stock: Paracetamol (3 left), Water (none left)." */
export function describeStockProblems(problems: readonly StockProblem[]): string {
  const parts = problems.map(
    (problem) =>
      `${problem.name} (${problem.available === 0 ? 'none left' : `${problem.available} left`})`,
  )
  return `Not enough stock: ${parts.join(', ')}.`
}

// ---------------------------------------------------------------------------
// The cart in the browser
// ---------------------------------------------------------------------------

/** Adds one of an item, never beyond the stock on hand. */
export function addToCart(
  lines: readonly CartLine[],
  itemId: string,
  available: number,
): CartLine[] {
  const existing = lines.find((line) => line.itemId === itemId)
  if (!existing) return available > 0 ? [...lines, { itemId, quantity: 1 }] : [...lines]
  return lines.map((line) =>
    line.itemId === itemId
      ? { ...line, quantity: Math.min(line.quantity + 1, Math.max(available, line.quantity)) }
      : line,
  )
}

/** Sets a line's quantity. Zero removes it. */
export function setCartQuantity(
  lines: readonly CartLine[],
  itemId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) return lines.filter((line) => line.itemId !== itemId)
  return lines.map((line) => (line.itemId === itemId ? { ...line, quantity } : line))
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}
