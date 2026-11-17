import { addDays, isDateKey } from '@/lib/dates'
import { PAYMENT_METHODS, type PaymentMethod } from './orders'
import { itemSales, type ItemSales, type OrderFacts } from './reports'

/**
 * The owner's sales report for a range of business days. Like the dashboard,
 * this defines what each number means; in Phase 2 the database does the sums.
 * Voided orders never count as sales; they are reported on their own.
 */

/** The longest range a report or an export may cover. */
export const REPORT_MAX_DAYS = 366

export interface ReportRange {
  /** Business days, "YYYY-MM-DD", inclusive. */
  from: string
  to: string
}

export interface SalesByKey {
  sales: number
  orders: number
}

export interface DaySales extends SalesByKey {
  dateKey: string
}

export interface StaffSales extends SalesByKey {
  staffId: string
  staffName: string
}

export interface StockValue {
  /** Own stock on hand valued at cost, for items with a cost price. */
  atCost: number
  /** The same items valued at their selling price. */
  atPrice: number
  itemsWithCost: number
  itemsWithoutCost: number
  /** Shared supplies on hand valued at cost, for supplies with a cost price. */
  suppliesAtCost: number
  suppliesWithoutCost: number
}

/** How much of a shared supply completed orders in the range used, and how much is left now. */
export interface SupplyReport {
  supplyId: string
  name: string
  unit: string | null
  used: number
  remaining: number
  /** Which items used it, most first. */
  byItem: { itemId: string; name: string; used: number }[]
}

export interface SalesReport extends ReportRange {
  sales: number
  orders: number
  /** Rounded to whole minor units. 0 when there were no orders. */
  averageOrder: number
  voided: number
  voidedTotal: number
  byPaymentMethod: Record<PaymentMethod, SalesByKey>
  byStaff: StaffSales[]
  /** Every day in the range, including days with no sales. */
  byDay: DaySales[]
  /** Every item on sale, best seller first. Items that sold nothing come last. */
  items: ItemSales[]
  /** Now, not over the range. Null when nothing has a cost price. */
  stockValue: StockValue | null
  /** Shared supplies: used in the range and remaining now. Empty when the business has none. */
  supplies: SupplyReport[]
}

/** Number of days in a range, counting both ends. */
export function rangeLength(range: ReportRange): number {
  const from = Date.parse(`${range.from}T00:00:00Z`)
  const to = Date.parse(`${range.to}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000) + 1
}

export function isValidRange(range: ReportRange): boolean {
  if (!isDateKey(range.from) || !isDateKey(range.to) || range.from > range.to) return false
  return rangeLength(range) <= REPORT_MAX_DAYS
}

export function inRange(dateKey: string, range: ReportRange): boolean {
  return dateKey >= range.from && dateKey <= range.to
}

export interface CatalogueItem {
  id: string
  name: string
  quantity: number
  price: number
  active: boolean
  /** Items that don't count their own stock are left out of stock value. Default true. */
  tracksOwnStock?: boolean
}

export interface CatalogueSupply {
  id: string
  name: string
  unit: string | null
  quantity: number
  active: boolean
}

/** One supply ledger entry made by a sale. */
export interface SupplySaleFact {
  supplyId: string
  orderId: string | null
  sourceItemId: string | null
  sourceItemName: string | null
  /** Negative: the amount the sale used. */
  delta: number
}

export interface SupplyFacts {
  supplies: readonly CatalogueSupply[]
  costs: Readonly<Record<string, number>>
  /** Supply entries of type "sale". Those of voided or out-of-range orders are ignored. */
  sales: readonly SupplySaleFact[]
}

/** Orders here carry their id so supply use can be matched to them. */
type ReportOrder = OrderFacts & { id?: string }

export function buildSalesReport(
  orders: readonly ReportOrder[],
  range: ReportRange,
  catalogue: readonly CatalogueItem[],
  costs: Readonly<Record<string, number>>,
  supplyFacts: SupplyFacts = { supplies: [], costs: {}, sales: [] },
): SalesReport {
  const byPaymentMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method.value, { sales: 0, orders: 0 }]),
  ) as Record<PaymentMethod, SalesByKey>
  const byStaff = new Map<string, StaffSales>()
  const byDay = new Map<string, DaySales>()

  let sales = 0
  let count = 0
  let voided = 0
  let voidedTotal = 0
  const inside = orders.filter((order) => inRange(order.dateKey, range))
  for (const order of inside) {
    if (order.status === 'voided') {
      voided += 1
      voidedTotal += order.total
      continue
    }
    sales += order.total
    count += 1
    byPaymentMethod[order.paymentMethod].sales += order.total
    byPaymentMethod[order.paymentMethod].orders += 1
    const staff = byStaff.get(order.staffId) ?? {
      staffId: order.staffId,
      staffName: order.staffName,
      sales: 0,
      orders: 0,
    }
    staff.sales += order.total
    staff.orders += 1
    byStaff.set(order.staffId, staff)
    const day = byDay.get(order.dateKey) ?? { dateKey: order.dateKey, sales: 0, orders: 0 }
    day.sales += order.total
    day.orders += 1
    byDay.set(order.dateKey, day)
  }

  // Best sellers from the orders, then every other item on sale with nothing sold.
  const sold = itemSales(inside, () => true)

  return {
    from: range.from,
    to: range.to,
    sales,
    orders: count,
    averageOrder: count === 0 ? 0 : Math.round(sales / count),
    voided,
    voidedTotal,
    byPaymentMethod,
    byStaff: [...byStaff.values()].sort((a, b) => b.sales - a.sales),
    byDay: fillDays(range, [...byDay.values()]),
    items: [...sold, ...unsoldItems(catalogue, sold)],
    stockValue: valueStock(catalogue, costs, supplyFacts),
    supplies: reportSupplies(inside, supplyFacts),
  }
}

/** Every day of the range in order, with the days that had sales filled in. */
export function fillDays(range: ReportRange, days: readonly DaySales[]): DaySales[] {
  const known = new Map(days.map((day) => [day.dateKey, day]))
  const result: DaySales[] = []
  for (let key = range.from; key <= range.to; key = addDays(key, 1)) {
    result.push(known.get(key) ?? { dateKey: key, sales: 0, orders: 0 })
  }
  return result
}

/** Items on sale that sold nothing, by name, to follow the best sellers. */
export function unsoldItems(
  catalogue: readonly CatalogueItem[],
  sold: readonly ItemSales[],
): ItemSales[] {
  const soldIds = new Set(sold.map((entry) => entry.itemId))
  return catalogue
    .filter((item) => item.active && !soldIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ itemId: item.id, name: item.name, quantity: 0, sales: 0 }))
}

/** How much of one supply one item used, from completed orders in the range. */
export interface SupplyUsage {
  supplyId: string
  sourceItemId: string | null
  sourceItemName: string | null
  used: number
}

/** Supply use counts completed orders in the range only; a voided order used nothing. */
function reportSupplies(inside: readonly ReportOrder[], facts: SupplyFacts): SupplyReport[] {
  const completed = new Set(
    inside.filter((order) => order.status === 'completed' && order.id).map((order) => order.id),
  )
  const usage = facts.sales
    .filter((sale) => sale.orderId && completed.has(sale.orderId))
    .map((sale) => ({
      supplyId: sale.supplyId,
      sourceItemId: sale.sourceItemId,
      sourceItemName: sale.sourceItemName,
      used: -sale.delta,
    }))
  return supplyReports(facts.supplies, usage)
}

/**
 * Each supply in use (or used in the range): how much was used, by which item
 * (most first), and how much is left now. Supplies with no use are listed too.
 */
export function supplyReports(
  supplies: readonly CatalogueSupply[],
  usage: readonly SupplyUsage[],
): SupplyReport[] {
  return supplies
    .map((supply) => {
      const byItem = new Map<string, { itemId: string; name: string; used: number }>()
      let used = 0
      for (const entry of usage) {
        if (entry.supplyId !== supply.id) continue
        used += entry.used
        const key = entry.sourceItemId ?? 'unknown'
        const item = byItem.get(key) ?? {
          itemId: key,
          name: entry.sourceItemName ?? 'An item',
          used: 0,
        }
        item.used += entry.used
        byItem.set(key, item)
      }
      return {
        supplyId: supply.id,
        name: supply.name,
        unit: supply.unit,
        used,
        remaining: supply.quantity,
        byItem: [...byItem.values()].sort((a, b) => b.used - a.used),
        active: supply.active,
      }
    })
    .filter((supply) => supply.active || supply.used > 0)
    .map(({ active: _active, ...supply }) => supply)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Stock on hand now, valued at cost and at price. Null when nothing has a cost price. */
export function valueStock(
  catalogue: readonly CatalogueItem[],
  costs: Readonly<Record<string, number>>,
  supplyFacts: SupplyFacts,
): StockValue | null {
  const value: StockValue = {
    atCost: 0,
    atPrice: 0,
    itemsWithCost: 0,
    itemsWithoutCost: 0,
    suppliesAtCost: 0,
    suppliesWithoutCost: 0,
  }
  let suppliesWithCost = 0
  for (const supply of supplyFacts.supplies) {
    if (!supply.active) continue
    const cost = supplyFacts.costs[supply.id]
    if (cost === undefined) {
      value.suppliesWithoutCost += 1
    } else {
      suppliesWithCost += 1
      value.suppliesAtCost += cost * Math.max(0, supply.quantity)
    }
  }
  for (const item of catalogue) {
    if (!item.active || item.tracksOwnStock === false) continue
    const cost = costs[item.id]
    if (cost === undefined) {
      value.itemsWithoutCost += 1
      continue
    }
    value.itemsWithCost += 1
    value.atCost += cost * Math.max(0, item.quantity)
    value.atPrice += item.price * Math.max(0, item.quantity)
  }
  return value.itemsWithCost === 0 && suppliesWithCost === 0 ? null : value
}

export type Granularity = 'day' | 'week' | 'month'

/** Days for up to two months, then weeks up to six months, then months, so a chart stays readable. */
export function granularityFor(range: ReportRange): Granularity {
  const days = rangeLength(range)
  if (days <= 62) return 'day'
  if (days <= 183) return 'week'
  return 'month'
}

/** Groups days into weeks (starting Monday) or months. Each bucket is keyed by its first day in range. */
export function bucketDays(days: readonly DaySales[], granularity: Granularity): DaySales[] {
  if (granularity === 'day') return [...days]
  const buckets = new Map<string, DaySales>()
  for (const day of days) {
    const key = granularity === 'month' ? `${day.dateKey.slice(0, 7)}-01` : mondayOf(day.dateKey)
    const bucket = buckets.get(key) ?? { dateKey: key, sales: 0, orders: 0 }
    bucket.sales += day.sales
    bucket.orders += day.orders
    buckets.set(key, bucket)
  }
  // Label each bucket by the first day actually in the range.
  const first = days[0]?.dateKey
  return [...buckets.values()].map((bucket, index) =>
    index === 0 && first !== undefined ? { ...bucket, dateKey: first } : bucket,
  )
}

function mondayOf(key: string): string {
  const weekday = new Date(`${key}T00:00:00Z`).getUTCDay()
  return addDays(key, -((weekday + 6) % 7))
}
