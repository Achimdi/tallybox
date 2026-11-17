import { z } from 'zod'
import { checkOrder, normalizeCart, type CartLine } from '@/domain/orders'
import { isLogoDataUrl } from '@/domain/rules'
import { dateKey, isDateKey } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import type {
  BusinessApi,
  BusinessSettings,
  HeldOrder,
  HeldOrdersApi,
  Item,
  ItemsApi,
  Order,
  OrdersApi,
  SuppliesApi,
} from '../types'
import {
  callFunction,
  callRpc,
  isoTime,
  isUuid,
  pageRange,
  readQuery,
  requireSignedInRole,
  type Role,
  type SupabaseApiOptions,
  type TallyboxClient,
} from './client'

/**
 * Orders, held orders and the business details receipts need, on Supabase (2C).
 *
 * Confirming, voiding and holding are database functions, one transaction
 * each, that check payment and stock themselves. When one refuses for stock,
 * it says only "insufficient_stock" or "item_unavailable"; the app then reads
 * items and supplies again and runs the demo's own checkOrder to say which
 * item or supply is short.
 */

export const ORDER_COLUMNS =
  'id, order_number, status, staff_id, staff_name, total, payment_method, payment_reference, payment_confirmed_by_name, payment_confirmed_at, customer_name, customer_phone, note, date_key, created_at, voided_at, voided_by_name, void_reason, order_lines(item_id, name, unit_price, qty, line_total, line_no)'

export const orderRow = z.object({
  id: z.string(),
  order_number: z.coerce.number(),
  status: z.enum(['completed', 'voided']),
  staff_id: z.string().nullable(),
  staff_name: z.string(),
  total: z.coerce.number(),
  payment_method: z.enum(['cash', 'bank_transfer', 'card']),
  payment_reference: z.string().nullable(),
  payment_confirmed_by_name: z.string(),
  payment_confirmed_at: z.string(),
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
  note: z.string().nullable(),
  date_key: z.string(),
  created_at: z.string(),
  voided_at: z.string().nullable(),
  voided_by_name: z.string().nullable(),
  void_reason: z.string().nullable(),
  order_lines: z.array(
    z.object({
      item_id: z.string(),
      name: z.string(),
      unit_price: z.coerce.number(),
      qty: z.number(),
      line_total: z.coerce.number(),
      line_no: z.number(),
    }),
  ),
})

const HELD_COLUMNS =
  'id, staff_id, staff_name, customer_name, customer_phone, note, created_at, updated_at, held_order_lines(item_id, qty, line_no)'

const heldRow = z.object({
  id: z.string(),
  staff_id: z.string().nullable(),
  staff_name: z.string(),
  customer_name: z.string().nullable(),
  customer_phone: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  held_order_lines: z.array(
    z.object({ item_id: z.string(), qty: z.number(), line_no: z.number() }),
  ),
})

const BUSINESS_COLUMNS =
  'id, name, business_code, currency_code, timezone, address, phone, receipt_footer, default_low_stock_level, logo_path, subscription_ends_at'

const businessRow = z.object({
  id: z.string(),
  name: z.string(),
  business_code: z.string(),
  currency_code: z.string(),
  timezone: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  receipt_footer: z.string().nullable(),
  default_low_stock_level: z.number(),
  logo_path: z.string().nullable(),
  subscription_ends_at: z.string().nullable(),
})

export function toOrder(row: z.infer<typeof orderRow>): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    staffId: row.staff_id ?? '',
    staffName: row.staff_name,
    total: row.total,
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference,
    paymentConfirmedByName: row.payment_confirmed_by_name,
    paymentConfirmedAt: isoTime(row.payment_confirmed_at),
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    note: row.note,
    dateKey: row.date_key,
    createdAt: isoTime(row.created_at),
    voidedAt: row.voided_at ? isoTime(row.voided_at) : null,
    voidedByName: row.voided_by_name,
    voidReason: row.void_reason,
    lines: [...row.order_lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((line) => ({
        itemId: line.item_id,
        name: line.name,
        unitPrice: line.unit_price,
        quantity: line.qty,
        lineTotal: line.line_total,
      })),
  }
}

function toHeldOrder(
  row: z.infer<typeof heldRow>,
  itemsById: ReadonlyMap<string, Item>,
): HeldOrder {
  // Shown with today's names, prices and stock. A hold stores only items and quantities.
  const lines = [...row.held_order_lines]
    .sort((a, b) => a.line_no - b.line_no)
    .map((line) => {
      const item = itemsById.get(line.item_id)
      return {
        itemId: line.item_id,
        quantity: line.qty,
        name: item?.name ?? 'Removed item',
        unitPrice: item?.price ?? 0,
        available: item ? item.available : 0,
        active: item?.active ?? false,
      }
    })
  return {
    id: row.id,
    staffId: row.staff_id ?? '',
    staffName: row.staff_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    note: row.note,
    createdAt: isoTime(row.created_at),
    updatedAt: isoTime(row.updated_at),
    lines,
    total: lines.reduce((sum, line) => sum + (line.active ? line.unitPrice * line.quantity : 0), 0),
  }
}

const toCartJson = (lines: readonly CartLine[]) =>
  lines.map((line) => ({ item_id: line.itemId, quantity: line.quantity }))

export function createOrdersApi(
  client: TallyboxClient,
  options: SupabaseApiOptions,
  stock: { items: ItemsApi; supplies: SuppliesApi },
) {
  const requireRole = (roles: readonly Role[]) => requireSignedInRole(client, roles)
  const rpc = <Name extends Parameters<typeof callRpc>[2], Schema extends z.ZodType>(
    name: Name,
    args: Parameters<typeof callRpc<Name, Schema>>[3],
    schema: Schema,
  ) => callRpc(client, options, name, args, schema)
  const read = <Schema extends z.ZodType>(
    query: Parameters<typeof readQuery<Schema>>[1],
    schema: Schema,
  ) => readQuery(options, query, schema)

  async function readBusiness() {
    const rows = await read(
      client.from('businesses').select(BUSINESS_COLUMNS),
      z.array(businessRow),
    )
    if (!rows[0]) throw new AppError('not_found')
    return rows[0]
  }

  async function readOrder(orderId: string): Promise<Order> {
    if (!isUuid(orderId)) throw new AppError('not_found')
    const rows = await read(
      client.from('orders').select(ORDER_COLUMNS).eq('id', orderId),
      z.array(orderRow),
    )
    // Missing, another business's, or (for staff) not their own from today.
    if (!rows[0]) throw new AppError('not_found')
    return toOrder(rows[0])
  }

  /**
   * Re-reads stock after the database refused a cart, to name what is short,
   * the same way the demo does. If stock has changed again since, the
   * database's answer still stands, just without the names.
   */
  async function explainRefusal(refusal: AppError, cart: readonly CartLine[]): Promise<AppError> {
    try {
      const [items, supplies] = await Promise.all([stock.items.list(), stock.supplies.list()])
      const check = checkOrder(
        normalizeCart(cart) ?? [],
        new Map(items.map((item) => [item.id, item])),
        new Map(supplies.map((supply) => [supply.id, supply])),
      )
      if (!check.ok && check.reason === 'item_unavailable') {
        return new AppError('item_unavailable', { cause: refusal, details: { names: check.names } })
      }
      if (!check.ok) {
        return new AppError('insufficient_stock', {
          cause: refusal,
          details: { problems: check.problems, supplyProblems: check.supplyProblems },
        })
      }
    } catch {
      // Fall through: the refusal itself is still right.
    }
    return new AppError(refusal.code, {
      cause: refusal,
      details:
        refusal.code === 'item_unavailable' ? { names: [] } : { problems: [], supplyProblems: [] },
    })
  }

  const isStockRefusal = (thrown: unknown): thrown is AppError =>
    thrown instanceof AppError &&
    (thrown.code === 'insufficient_stock' || thrown.code === 'item_unavailable')

  const orders: OrdersApi = {
    async create(input) {
      await requireRole(['owner', 'staff'])
      let orderId: string
      try {
        orderId = await rpc(
          'create_order',
          {
            p_client_order_id: input.clientOrderId,
            p_lines: toCartJson(input.lines),
            p_payment_method: input.paymentMethod,
            p_payment_reference: input.paymentReference,
            p_payment_confirmed: input.paymentConfirmed,
            p_customer_name: input.customerName,
            p_customer_phone: input.customerPhone,
            p_note: input.note,
            ...(input.heldOrderId ? { p_held_order_id: input.heldOrderId } : {}),
          },
          z.string(),
        )
      } catch (thrown) {
        if (isStockRefusal(thrown)) throw await explainRefusal(thrown, input.lines)
        throw thrown
      }
      return readOrder(orderId)
    },

    async listMine() {
      const { userId } = await requireRole(['owner', 'staff'])
      // Today in the business's own time zone began less than 26 hours ago anywhere.
      const since = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
      const [business, rows] = await Promise.all([
        readBusiness(),
        read(
          client
            .from('orders')
            .select(ORDER_COLUMNS)
            .eq('staff_id', userId)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false }),
          z.array(orderRow),
        ),
      ])
      const today = dateKey(new Date(), business.timezone)
      return rows.filter((row) => row.date_key === today).map(toOrder)
    },

    async get(orderId) {
      await requireRole(['owner', 'staff'])
      return readOrder(orderId)
    },

    async list(filter) {
      await requireRole(['owner'])
      if (!isDateKey(filter.from) || !isDateKey(filter.to) || filter.from > filter.to) {
        throw new AppError('validation')
      }
      if (filter.staffId && !isUuid(filter.staffId)) return { rows: [], total: 0 }

      let query = client
        .from('orders')
        .select(ORDER_COLUMNS, { count: 'exact' })
        .gte('date_key', filter.from)
        .lte('date_key', filter.to)
      if (filter.staffId) query = query.eq('staff_id', filter.staffId)
      if (filter.status) query = query.eq('status', filter.status)
      if (filter.paymentMethod) query = query.eq('payment_method', filter.paymentMethod)
      // "#42", "42" or "0042". Anything that isn't a number searches nothing out.
      const searchNumber = filter.search?.replace(/[#\s]/g, '')
      const wanted = searchNumber ? Number.parseInt(searchNumber, 10) : Number.NaN
      if (!Number.isNaN(wanted)) query = query.eq('order_number', wanted)

      const range = pageRange(filter.offset, filter.limit)
      const result = await read(
        query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(range.from, range.to)
          .then(({ data, error, count }) => ({ data: { rows: data, count }, error })),
        z.object({ rows: z.array(orderRow), count: z.number().nullable() }),
      )
      return { rows: result.rows.map(toOrder), total: result.count ?? result.rows.length }
    },

    async void({ orderId, reason }) {
      await requireRole(['owner'])
      if (!isUuid(orderId)) throw new AppError('not_found')
      await rpc('void_order', { p_order_id: orderId, p_reason: reason }, z.unknown())
      return readOrder(orderId)
    },
  }

  async function readHolds(heldOrderId?: string): Promise<HeldOrder[]> {
    let query = client.from('held_orders').select(HELD_COLUMNS)
    if (heldOrderId) query = query.eq('id', heldOrderId)
    const [rows, items] = await Promise.all([
      read(
        query.order('updated_at', { ascending: false }).order('id', { ascending: false }),
        z.array(heldRow),
      ),
      stock.items.list(),
    ])
    const itemsById = new Map(items.map((item) => [item.id, item]))
    return rows.map((row) => toHeldOrder(row, itemsById))
  }

  const held: HeldOrdersApi = {
    async list() {
      await requireRole(['owner', 'staff'])
      return readHolds()
    },

    async save(input) {
      await requireRole(['owner', 'staff'])
      // An id that can't be a hold makes a new one, as in the demo.
      const existing = input.heldOrderId && isUuid(input.heldOrderId) ? input.heldOrderId : null
      let heldOrderId: string
      try {
        heldOrderId = await rpc(
          'save_held_order',
          {
            p_held_order_id: existing as string,
            p_lines: toCartJson(input.lines),
            p_customer_name: input.customerName,
            p_customer_phone: input.customerPhone,
            p_note: input.note,
          },
          z.string(),
        )
      } catch (thrown) {
        if (isStockRefusal(thrown)) throw await explainRefusal(thrown, input.lines)
        throw thrown
      }
      const [saved] = await readHolds(heldOrderId)
      if (!saved) throw new AppError('server')
      return saved
    },

    async discard(heldOrderId) {
      await requireRole(['owner', 'staff'])
      if (!isUuid(heldOrderId)) throw new AppError('not_found')
      await rpc('discard_held_order', { p_held_order_id: heldOrderId }, z.unknown())
    },
  }

  /** Where a stored logo can be fetched: the public "logos" bucket. */
  const logoUrl = (path: string | null) =>
    path ? client.storage.from('logos').getPublicUrl(path).data.publicUrl : null

  async function readSettings(): Promise<BusinessSettings> {
    const row = await readBusiness()
    return {
      id: row.id,
      name: row.name,
      businessCode: row.business_code,
      currencyCode: row.currency_code,
      timezone: row.timezone,
      address: row.address,
      phone: row.phone,
      receiptFooter: row.receipt_footer,
      defaultLowStockLevel: row.default_low_stock_level,
      logoUrl: logoUrl(row.logo_path),
      accessEndsAt: row.subscription_ends_at ? isoTime(row.subscription_ends_at) : null,
    }
  }

  const business: BusinessApi = {
    async get() {
      await requireRole(['owner', 'staff'])
      return readSettings()
    },

    async update(input) {
      await requireRole(['owner'])
      // Checked first, so a bad picture never leaves the other settings half saved.
      if (typeof input.logo === 'string' && !isLogoDataUrl(input.logo)) {
        throw new AppError('validation')
      }
      await rpc(
        'update_business_settings',
        {
          p_name: input.name,
          p_currency_code: input.currencyCode,
          p_timezone: input.timezone,
          p_address: input.address,
          p_phone: input.phone,
          p_receipt_footer: input.receiptFooter,
          p_default_low_stock_level: input.defaultLowStockLevel,
        },
        z.unknown(),
      )
      // Left out: keep the logo. Null: remove it. A picture: store it. Only an
      // Edge Function may write to Storage.
      if (input.logo !== undefined) {
        await callFunction(
          client,
          options,
          'update-business-logo',
          { logo: input.logo },
          z.object({ logoPath: z.string().nullable() }),
        )
      }
      return readSettings()
    },
  }

  return { orders, held, business }
}
