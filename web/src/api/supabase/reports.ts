import { z } from 'zod'
import { emptyByPaymentMethod, lowStockItems, lowSupplies, type DaySummary } from '@/domain/reports'
import {
  fillDays,
  isValidRange,
  supplyReports,
  unsoldItems,
  valueStock,
  type ReportRange,
  type SalesReport,
} from '@/domain/salesReport'
import { AppError } from '@/lib/errors'
import { EXPORT_MAX_ORDERS, type ItemsApi, type ReportsApi, type SuppliesApi } from '../types'
import {
  callRpc,
  readQuery,
  requireSignedInRole,
  type Role,
  type SupabaseApiOptions,
  type TallyboxClient,
} from './client'
import { ORDER_COLUMNS, orderRow, toOrder } from './orders'

/**
 * The owner's dashboard, sales reports and CSV export on Supabase.
 *
 * The database adds up the orders (owner_dashboard, sales_report), so the
 * browser never reads whole tables. What is true now (low stock, stock value,
 * items that sold nothing, what is left of each supply) comes from the item
 * and supply lists, through the same pure rules the demo uses.
 */

const money = z.coerce.number()
const count = z.coerce.number()

const daySchema = z.object({
  date_key: z.string(),
  sales: money,
  orders: count,
  voided: count,
  voided_total: money,
  by_payment_method: z.object({ cash: money, bank_transfer: money, card: money }),
})

const itemSalesSchema = z.array(
  z.object({ item_id: z.string(), name: z.string(), quantity: count, sales: money }),
)

const dashboardSchema = z.object({
  today: daySchema,
  yesterday: daySchema,
  top_items_today: itemSalesSchema,
})

const bySchema = z.object({ sales: money, orders: count })

const reportSchema = z.object({
  sales: money,
  orders: count,
  voided: count,
  voided_total: money,
  by_payment_method: z.object({ cash: bySchema, bank_transfer: bySchema, card: bySchema }),
  by_staff: z.array(
    z.object({ staff_id: z.string(), staff_name: z.string(), sales: money, orders: count }),
  ),
  by_day: z.array(z.object({ date_key: z.string(), sales: money, orders: count })),
  items: itemSalesSchema,
  supply_use: z.array(
    z.object({
      supply_id: z.string(),
      source_item_id: z.string().nullable(),
      source_item_name: z.string().nullable(),
      used: count,
    }),
  ),
})

function toDay(row: z.infer<typeof daySchema>): DaySummary {
  return {
    dateKey: row.date_key,
    sales: row.sales,
    orders: row.orders,
    voided: row.voided,
    voidedTotal: row.voided_total,
    byPaymentMethod: { ...emptyByPaymentMethod(), ...row.by_payment_method },
  }
}

const toItemSales = (rows: z.infer<typeof itemSalesSchema>) =>
  rows.map((row) => ({
    itemId: row.item_id,
    name: row.name,
    quantity: row.quantity,
    sales: row.sales,
  }))

/** PostgREST returns at most 1,000 rows at a time on Supabase. */
const EXPORT_PAGE = 1000

export function createReportsApi(
  client: TallyboxClient,
  options: SupabaseApiOptions,
  stock: { items: ItemsApi; supplies: SuppliesApi },
): ReportsApi {
  const requireRole = (roles: readonly Role[]) => requireSignedInRole(client, roles)
  const rpc = <Name extends Parameters<typeof callRpc>[2], Schema extends z.ZodType>(
    name: Name,
    args: Parameters<typeof callRpc<Name, Schema>>[3],
    schema: Schema,
  ) => callRpc(client, options, name, args, schema)

  async function checkRange(range: ReportRange) {
    await requireRole(['owner'])
    if (!isValidRange(range)) throw new AppError('validation')
  }

  return {
    async dashboard() {
      await requireRole(['owner'])
      const [sums, items, supplies] = await Promise.all([
        rpc('owner_dashboard', {}, dashboardSchema),
        stock.items.list(),
        stock.supplies.list(),
      ])
      return {
        today: toDay(sums.today),
        yesterday: toDay(sums.yesterday),
        topItemsToday: toItemSales(sums.top_items_today),
        lowStock: lowStockItems(items),
        lowSupplies: lowSupplies(supplies),
      }
    },

    async summary(range) {
      await checkRange(range)
      const [sums, items, costs, supplies, supplyCosts] = await Promise.all([
        rpc('sales_report', { p_from: range.from, p_to: range.to }, reportSchema),
        stock.items.list(),
        stock.items.costs(),
        stock.supplies.list(),
        stock.supplies.costs(),
      ])
      const sold = toItemSales(sums.items)
      const report: SalesReport = {
        from: range.from,
        to: range.to,
        sales: sums.sales,
        orders: sums.orders,
        averageOrder: sums.orders === 0 ? 0 : Math.round(sums.sales / sums.orders),
        voided: sums.voided,
        voidedTotal: sums.voided_total,
        byPaymentMethod: sums.by_payment_method,
        byStaff: sums.by_staff.map((row) => ({
          staffId: row.staff_id,
          staffName: row.staff_name,
          sales: row.sales,
          orders: row.orders,
        })),
        byDay: fillDays(
          range,
          sums.by_day.map((row) => ({
            dateKey: row.date_key,
            sales: row.sales,
            orders: row.orders,
          })),
        ),
        items: [...sold, ...unsoldItems(items, sold)],
        stockValue: valueStock(items, costs, { supplies, costs: supplyCosts, sales: [] }),
        supplies: supplyReports(
          supplies,
          sums.supply_use.map((row) => ({
            supplyId: row.supply_id,
            sourceItemId: row.source_item_id,
            sourceItemName: row.source_item_name,
            used: row.used,
          })),
        ),
      }
      return report
    },

    async exportOrders(range) {
      await checkRange(range)
      const rows: z.infer<typeof orderRow>[] = []
      let total = 0
      // Oldest first, a page at a time, up to the export limit.
      for (let from = 0; from < EXPORT_MAX_ORDERS; from += EXPORT_PAGE) {
        const to = Math.min(from + EXPORT_PAGE, EXPORT_MAX_ORDERS) - 1
        const page = await readQuery(
          options,
          client
            .from('orders')
            .select(ORDER_COLUMNS, { count: 'exact' })
            .gte('date_key', range.from)
            .lte('date_key', range.to)
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
            .then(({ data, error, count: rowCount }) => ({
              data: { rows: data, count: rowCount },
              error,
            })),
          z.object({ rows: z.array(orderRow), count: z.number().nullable() }),
        )
        rows.push(...page.rows)
        total = page.count ?? rows.length
        if (rows.length >= total || page.rows.length < to - from + 1) break
      }
      return { orders: rows.map(toOrder), truncated: total > EXPORT_MAX_ORDERS }
    },
  }
}
