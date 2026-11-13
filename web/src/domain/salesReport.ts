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
  /** Stock on hand valued at cost, for items with a cost price. */
  atCost: number
  /** The same items valued at their selling price. */
  atPrice: number
  itemsWithCost: number
  itemsWithoutCost: number
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
  /** Now, not over the range. Null when no item has a cost price. */
  stockValue: StockValue | null
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

interface CatalogueItem {
  id: string
  name: string
  quantity: number
  price: number
  active: boolean
}

export function buildSalesReport(
  orders: readonly OrderFacts[],
  range: ReportRange,
  catalogue: readonly CatalogueItem[],
  costs: Readonly<Record<string, number>>,
): SalesReport {
  const byPaymentMethod = Object.fromEntries(
    PAYMENT_METHODS.map((method) => [method.value, { sales: 0, orders: 0 }]),
  ) as Record<PaymentMethod, SalesByKey>
  const byStaff = new Map<string, StaffSales>()
  const byDay = new Map<string, DaySales>()
  for (let key = range.from; key <= range.to; key = addDays(key, 1)) {
    byDay.set(key, { dateKey: key, sales: 0, orders: 0 })
  }

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
    const day = byDay.get(order.dateKey)
    if (day) {
      day.sales += order.total
      day.orders += 1
    }
  }

  // Best sellers from the orders, then every other item on sale with nothing sold.
  const sold = itemSales(inside, () => true)
  const soldIds = new Set(sold.map((entry) => entry.itemId))
  const unsold = catalogue
    .filter((item) => item.active && !soldIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((item) => ({ itemId: item.id, name: item.name, quantity: 0, sales: 0 }))

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
    byDay: [...byDay.values()],
    items: [...sold, ...unsold],
    stockValue: valueStock(catalogue, costs),
  }
}

function valueStock(
  catalogue: readonly CatalogueItem[],
  costs: Readonly<Record<string, number>>,
): StockValue | null {
  const value: StockValue = { atCost: 0, atPrice: 0, itemsWithCost: 0, itemsWithoutCost: 0 }
  for (const item of catalogue) {
    if (!item.active) continue
    const cost = costs[item.id]
    if (cost === undefined) {
      value.itemsWithoutCost += 1
      continue
    }
    value.itemsWithCost += 1
    value.atCost += cost * Math.max(0, item.quantity)
    value.atPrice += item.price * Math.max(0, item.quantity)
  }
  return value.itemsWithCost === 0 ? null : value
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
