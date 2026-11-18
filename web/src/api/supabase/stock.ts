import { z } from 'zod'
import { isAdjustReason } from '@/domain/stock'
import { availableToSell, type SupplyUse } from '@/domain/supplies'
import { AppError } from '@/lib/errors'
import type {
  Item,
  ItemSupplyUse,
  ItemsApi,
  StockApi,
  StockModeChange,
  StockMovement,
  SuppliesApi,
  Supply,
} from '../types'
import {
  callRpc,
  fromReadError,
  isoTime,
  pageRange,
  readQuery,
  requireSignedInRole,
  type Role,
  type SupabaseApiOptions,
  type TallyboxClient,
} from './client'

/**
 * Items, shared supplies and stock on Supabase.
 *
 * Reads go straight to the tables, where Row Level Security decides what each
 * person may see. Every change goes through a database function, one
 * transaction each. "How many can be sold" is worked out with the same pure
 * rule as the demo (domain/supplies.ts).
 */

const itemRow = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  unit: z.string().nullable(),
  price: z.coerce.number(),
  tracks_own_stock: z.boolean(),
  quantity: z.number(),
  low_stock_level: z.number(),
  active: z.boolean(),
})

const supplyRow = z.object({
  id: z.string(),
  name: z.string(),
  unit: z.string().nullable(),
  quantity: z.number(),
  low_stock_level: z.number(),
  active: z.boolean(),
})

const useRow = z.object({ item_id: z.string(), supply_id: z.string(), units_per_sale: z.number() })

const modeSchema = z.object({
  tracks_own_stock: z.boolean(),
  supplies: z.array(z.object({ supply_id: z.string(), units_per_sale: z.number() })),
})

const movementRow = z.object({
  id: z.string(),
  item_id: z.string().nullable(),
  supply_id: z.string().nullable(),
  item_name: z.string(),
  source_item_id: z.string().nullable(),
  source_item_name: z.string().nullable(),
  type: z.enum(['opening', 'sale', 'void', 'restock', 'adjustment']),
  delta: z.number(),
  quantity_before: z.number(),
  quantity_after: z.number(),
  reason: z.string().nullable(),
  note: z.string().nullable(),
  order_id: z.string().nullable(),
  restock_id: z.string().nullable(),
  supplier: z.string().nullable(),
  unit_cost: z.coerce.number().nullable(),
  created_by: z.string().nullable(),
  created_by_name: z.string(),
  date_key: z.string(),
  created_at: z.string(),
  order: z.object({ order_number: z.coerce.number() }).nullable().optional(),
})

const byName = <Row extends { name: string }>(a: Row, b: Row) => a.name.localeCompare(b.name)

export function createStockApi(client: TallyboxClient, options: SupabaseApiOptions) {
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

  /** Everything needed to describe items and supplies, read in parallel. */
  async function snapshot() {
    await requireRole(['owner', 'staff'])
    const [items, supplies, uses] = await Promise.all([
      read(
        client
          .from('items')
          .select(
            'id, name, category, unit, price, tracks_own_stock, quantity, low_stock_level, active',
          ),
        z.array(itemRow),
      ),
      read(
        client.from('supplies').select('id, name, unit, quantity, low_stock_level, active'),
        z.array(supplyRow),
      ),
      read(
        client.from('item_supplies').select('item_id, supply_id, units_per_sale'),
        z.array(useRow),
      ),
    ])
    return { items, supplies, uses }
  }

  type Snapshot = Awaited<ReturnType<typeof snapshot>>

  function describeUses(
    snap: Pick<Snapshot, 'supplies'>,
    uses: readonly { supply_id: string; units_per_sale: number }[],
  ): ItemSupplyUse[] {
    return uses.map((use) => {
      const supply = snap.supplies.find((candidate) => candidate.id === use.supply_id)
      return {
        supplyId: use.supply_id,
        name: supply?.name ?? 'Removed supply',
        unit: supply?.unit ?? null,
        unitsPerSale: use.units_per_sale,
      }
    })
  }

  function toItem(snap: Snapshot, row: z.infer<typeof itemRow>): Item {
    const uses = snap.uses.filter((use) => use.item_id === row.id)
    const supplyUses: SupplyUse[] = uses.map((use) => ({
      supplyId: use.supply_id,
      unitsPerSale: use.units_per_sale,
    }))
    const suppliesById = new Map(snap.supplies.map((supply) => [supply.id, { ...supply }]))
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      price: row.price,
      tracksOwnStock: row.tracks_own_stock,
      quantity: row.quantity,
      supplies: describeUses(snap, uses),
      available: availableToSell(
        {
          id: row.id,
          name: row.name,
          tracksOwnStock: row.tracks_own_stock,
          quantity: row.quantity,
          supplies: supplyUses,
        },
        suppliesById,
      ),
      lowStockLevel: row.low_stock_level,
      active: row.active,
    }
  }

  function toSupply(snap: Snapshot, row: z.infer<typeof supplyRow>): Supply {
    return {
      id: row.id,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      lowStockLevel: row.low_stock_level,
      active: row.active,
      usedBy: snap.uses
        .filter((use) => use.supply_id === row.id)
        .map((use) => ({ use, item: snap.items.find((candidate) => candidate.id === use.item_id) }))
        .filter(({ item }) => item?.active)
        .map(({ use, item }) => ({
          itemId: use.item_id,
          name: item!.name,
          unitsPerSale: use.units_per_sale,
        }))
        .sort(byName),
    }
  }

  async function oneItem(itemId: string): Promise<Item> {
    const snap = await snapshot()
    const row = snap.items.find((candidate) => candidate.id === itemId)
    if (!row) throw new AppError('not_found')
    return toItem(snap, row)
  }

  async function oneSupply(supplyId: string): Promise<Supply> {
    const snap = await snapshot()
    const row = snap.supplies.find((candidate) => candidate.id === supplyId)
    if (!row) throw new AppError('not_found')
    return toSupply(snap, row)
  }

  const items: ItemsApi = {
    async list() {
      const snap = await snapshot()
      return snap.items.map((row) => toItem(snap, row)).sort(byName)
    },

    async costs() {
      await requireRole(['owner'])
      const rows = await read(
        client.from('item_costs').select('item_id, cost_price'),
        z.array(z.object({ item_id: z.string(), cost_price: z.coerce.number() })),
      )
      return Object.fromEntries(rows.map((row) => [row.item_id, row.cost_price]))
    },

    async upsert(input) {
      await rpc(
        'upsert_item',
        {
          p_item_id: input.itemId,
          p_name: input.name,
          p_category: input.category,
          p_unit: input.unit,
          p_price: input.price,
          p_cost_price: input.costPrice as number,
          p_low_stock_level: input.lowStockLevel as number,
          p_opening_quantity: input.openingQuantity,
          p_tracks_own_stock: input.tracksOwnStock,
          p_supplies: input.supplies.map((use) => ({
            supply_id: use.supplyId,
            units_per_sale: use.unitsPerSale,
          })),
        },
        z.string(),
      )
      return oneItem(input.itemId)
    },

    async archive(itemId) {
      await rpc('archive_item', { p_item_id: itemId }, z.unknown())
    },

    async restore(itemId) {
      await rpc('restore_item', { p_item_id: itemId }, z.unknown())
    },

    async stockModeChanges(itemId) {
      await requireRole(['owner'])
      const [rows, supplies] = await Promise.all([
        read(
          client
            .from('stock_mode_changes')
            .select('id, changed_by_name, changed_at, before, after')
            .eq('item_id', itemId)
            .order('changed_at', { ascending: false }),
          z.array(
            z.object({
              id: z.string(),
              changed_by_name: z.string(),
              changed_at: z.string(),
              before: modeSchema,
              after: modeSchema,
            }),
          ),
        ),
        read(
          client.from('supplies').select('id, name, unit, quantity, low_stock_level, active'),
          z.array(supplyRow),
        ),
      ])
      return rows.map((row): StockModeChange => ({
        id: row.id,
        changedAt: isoTime(row.changed_at),
        changedByName: row.changed_by_name,
        before: {
          tracksOwnStock: row.before.tracks_own_stock,
          supplies: describeUses({ supplies }, row.before.supplies),
        },
        after: {
          tracksOwnStock: row.after.tracks_own_stock,
          supplies: describeUses({ supplies }, row.after.supplies),
        },
      }))
    },
  }

  const supplies: SuppliesApi = {
    async list() {
      const snap = await snapshot()
      return snap.supplies.map((row) => toSupply(snap, row)).sort(byName)
    },

    async costs() {
      await requireRole(['owner'])
      const rows = await read(
        client.from('supply_costs').select('supply_id, cost_price'),
        z.array(z.object({ supply_id: z.string(), cost_price: z.coerce.number() })),
      )
      return Object.fromEntries(rows.map((row) => [row.supply_id, row.cost_price]))
    },

    async upsert(input) {
      await rpc(
        'upsert_supply',
        {
          p_supply_id: input.supplyId,
          p_name: input.name,
          p_unit: input.unit,
          p_cost_price: input.costPrice as number,
          p_low_stock_level: input.lowStockLevel as number,
          p_opening_quantity: input.openingQuantity,
        },
        z.string(),
      )
      return oneSupply(input.supplyId)
    },

    async archive(supplyId) {
      await rpc('archive_supply', { p_supply_id: supplyId }, z.unknown())
    },

    async restore(supplyId) {
      await rpc('restore_supply', { p_supply_id: supplyId }, z.unknown())
    },
  }

  /** The quantity right now, for an item or a supply (to explain a stale count). */
  async function currentQuantity(target: { itemId?: string; supplyId?: string }) {
    const table = target.itemId ? 'items' : 'supplies'
    const id = target.itemId ?? target.supplyId ?? ''
    const rows = await read(
      client.from(table).select('quantity').eq('id', id),
      z.array(z.object({ quantity: z.number() })),
    )
    return rows[0]?.quantity
  }

  const stock: StockApi = {
    async restock(input) {
      const restockId = await rpc(
        'record_restock',
        {
          p_client_id: input.clientId,
          p_received_on: input.receivedOn,
          p_supplier: input.supplier,
          p_note: input.note,
          p_lines: input.lines.map((line) => ({
            ...(line.itemId ? { item_id: line.itemId } : {}),
            ...(line.supplyId ? { supply_id: line.supplyId } : {}),
            quantity: line.quantity,
            unit_cost: line.unitCost,
          })),
        },
        z.string(),
      )
      return { restockId }
    },

    async adjust(input) {
      try {
        const quantity = await rpc(
          'adjust_stock',
          {
            // Both are always sent (one as null) so the server finds the function.
            p_item_id: (input.itemId ?? null) as string,
            p_supply_id: (input.supplyId ?? null) as string,
            p_counted_quantity: input.countedQuantity,
            p_expected_quantity: input.expectedQuantity,
            p_reason: input.reason,
            p_note: input.note,
          },
          z.number(),
        )
        return { quantity }
      } catch (thrown) {
        // Stock changed while counting: say what it is now, as the demo does.
        if (thrown instanceof AppError && thrown.code === 'conflict') {
          const quantity = await currentQuantity(input)
          throw new AppError('conflict', { cause: thrown, details: { quantity } })
        }
        throw thrown
      }
    },

    async movements(filter) {
      await requireRole(['owner'])
      const range = pageRange(filter.offset, filter.limit)
      let query = client
        .from('stock_movements')
        .select(
          'id, item_id, supply_id, item_name, source_item_id, source_item_name, type, delta, quantity_before, quantity_after, reason, note, order_id, restock_id, supplier, unit_cost, created_by, created_by_name, date_key, created_at, order:orders!stock_movements_order_fk(order_number)',
          { count: 'exact' },
        )
      if (filter.itemId) query = query.eq('item_id', filter.itemId)
      if (filter.supplyId) query = query.eq('supply_id', filter.supplyId)
      if (filter.type) query = query.eq('type', filter.type)
      if (filter.from) query = query.gte('date_key', filter.from)
      if (filter.to) query = query.lte('date_key', filter.to)
      if (filter.userId) query = query.eq('created_by', filter.userId)

      if (!options.isOnline()) throw new AppError('offline')
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(range.from, range.to)
      if (error) throw fromReadError(error)
      const parsed = z.array(movementRow).safeParse(data)
      if (!parsed.success) throw new AppError('server', { cause: parsed.error })
      const rows = parsed.data
      return {
        total: count ?? rows.length,
        rows: rows.map((row): StockMovement => ({
          id: row.id,
          itemId: row.item_id,
          supplyId: row.supply_id,
          itemName: row.item_name,
          sourceItemId: row.source_item_id,
          sourceItemName: row.source_item_name,
          type: row.type,
          delta: row.delta,
          quantityBefore: row.quantity_before,
          quantityAfter: row.quantity_after,
          reason: isAdjustReason(row.reason) ? row.reason : null,
          note: row.note,
          orderId: row.order_id,
          orderNumber: row.order?.order_number ?? null,
          restockId: row.restock_id,
          supplier: row.supplier,
          unitCost: row.unit_cost,
          createdById: row.created_by,
          createdByName: row.created_by_name,
          dateKey: row.date_key,
          createdAt: isoTime(row.created_at),
        })),
      }
    },
  }

  return { items, supplies, stock }
}
