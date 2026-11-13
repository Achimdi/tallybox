import type { PaymentMethod } from './orders'

/**
 * Sales figures, worked out from orders. In Phase 2 the database does the same
 * sums (so the browser never reads whole tables); these functions define what
 * the numbers mean.
 *
 * Voided orders never count as sales. They are counted separately.
 */

export interface OrderFacts {
  status: 'completed' | 'voided'
  dateKey: string
  total: number
  paymentMethod: PaymentMethod
  staffId: string
  staffName: string
  lines: readonly { itemId: string; name: string; quantity: number; lineTotal: number }[]
}

export interface DaySummary {
  dateKey: string
  /** Completed orders only, minor units. */
  sales: number
  orders: number
  voided: number
  voidedTotal: number
  byPaymentMethod: Record<PaymentMethod, number>
}

export function emptyByPaymentMethod(): Record<PaymentMethod, number> {
  return { cash: 0, bank_transfer: 0, card: 0 }
}

export function summarizeDay(orders: readonly OrderFacts[], dateKey: string): DaySummary {
  const summary: DaySummary = {
    dateKey,
    sales: 0,
    orders: 0,
    voided: 0,
    voidedTotal: 0,
    byPaymentMethod: emptyByPaymentMethod(),
  }
  for (const order of orders) {
    if (order.dateKey !== dateKey) continue
    if (order.status === 'voided') {
      summary.voided += 1
      summary.voidedTotal += order.total
    } else {
      summary.sales += order.total
      summary.orders += 1
      summary.byPaymentMethod[order.paymentMethod] += order.total
    }
  }
  return summary
}

export interface ItemSales {
  itemId: string
  name: string
  quantity: number
  sales: number
}

/** Best sellers by amount sold, from completed orders only. */
export function itemSales(
  orders: readonly OrderFacts[],
  predicate: (order: OrderFacts) => boolean,
): ItemSales[] {
  const byItem = new Map<string, ItemSales>()
  for (const order of orders) {
    if (order.status !== 'completed' || !predicate(order)) continue
    for (const line of order.lines) {
      const entry = byItem.get(line.itemId) ?? {
        itemId: line.itemId,
        name: line.name,
        quantity: 0,
        sales: 0,
      }
      entry.quantity += line.quantity
      entry.sales += line.lineTotal
      byItem.set(line.itemId, entry)
    }
  }
  return [...byItem.values()].sort((a, b) => b.sales - a.sales || b.quantity - a.quantity)
}

export type Trend = { direction: 'up' | 'down' | 'flat'; label: string }

/** "12% vs yesterday", "New today", "Same as yesterday". */
export function trendAgainst(today: number, yesterday: number, unit: 'percent' | 'count'): Trend {
  if (today === yesterday) return { direction: 'flat', label: 'Same as yesterday' }
  const direction = today > yesterday ? 'up' : 'down'
  if (unit === 'count') {
    const difference = Math.abs(today - yesterday)
    return {
      direction,
      label: `${difference} ${direction === 'up' ? 'more' : 'fewer'} than yesterday`,
    }
  }
  if (yesterday === 0) return { direction: 'up', label: 'None yesterday' }
  const percent = Math.round((Math.abs(today - yesterday) / yesterday) * 100)
  return { direction, label: `${percent}% ${direction === 'up' ? 'up' : 'down'} on yesterday` }
}
