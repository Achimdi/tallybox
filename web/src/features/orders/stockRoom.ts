import type { Item, Supply } from '@/api/types'
import { ORDER_LIMITS, type CartLine } from '@/domain/orders'
import { roomInCart, supplyProblems, type SupplyProblem } from '@/domain/supplies'

/**
 * What the cart may still take, for the selling screens. The same rules as
 * the server (domain/supplies.ts), so taps are blocked before a confirm would
 * be refused. The server checks again when the order is confirmed.
 */
export interface SellingStock {
  /** The most of this item the cart may hold (what is in it plus what is left). Null: no limit. */
  capFor(itemId: string): number | null
  /** Own stock left when a line asks for more than that, else null. */
  ownShortfall(itemId: string, quantity: number): number | null
  /** Shared supplies the cart needs more of than there is. */
  supplyProblems: SupplyProblem[]
}

export function sellingStock(
  items: readonly Item[],
  supplies: readonly Supply[],
  lines: readonly CartLine[],
): SellingStock {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const suppliesById = new Map(supplies.map((supply) => [supply.id, supply]))
  return {
    capFor(itemId) {
      const inCart = lines.find((line) => line.itemId === itemId)?.quantity ?? 0
      const room = roomInCart(itemId, lines, itemsById, suppliesById)
      return room === null ? null : inCart + room
    },
    ownShortfall(itemId, quantity) {
      const item = itemsById.get(itemId)
      if (!item?.tracksOwnStock) return null
      return quantity > item.quantity ? Math.max(0, item.quantity) : null
    },
    supplyProblems: supplyProblems(lines, itemsById, suppliesById),
  }
}

/** A cap for the cart helpers, which need a number. */
export function capOrMax(cap: number | null): number {
  return cap ?? ORDER_LIMITS.maxQuantity
}
