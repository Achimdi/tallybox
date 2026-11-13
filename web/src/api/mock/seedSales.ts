import { DAY_MS } from '@/domain/access'
import type { PaymentMethod } from '@/domain/orders'
import { dateKey } from '@/lib/dates'
import type {
  MockHeldOrder,
  MockItem,
  MockItemCost,
  MockOrder,
  MockStockMovement,
  MovementType,
} from './store'

/**
 * Sunrise Pharmacy's demo catalogue and a week of trading. All made up.
 *
 * Built so the stock rules hold exactly: every item's quantity equals the sum
 * of its ledger, and stock never goes below zero at any moment. Sales are
 * generated first; then each item's opening stock is worked out backwards from
 * the quantity it should end with, and the whole history is replayed in time
 * order to write the ledger.
 */

interface CatalogueEntry {
  key: string
  name: string
  category: string
  unit: string
  /** Naira. Stored as kobo. */
  price: number
  /** Naira, or null when the owner has not entered one. */
  cost: number | null
  /** Quantity at the end of the seed. */
  target: number
  low: number
  archived?: boolean
}

const CATALOGUE: readonly CatalogueEntry[] = [
  // Medicines
  {
    key: 'paracetamol',
    name: 'Paracetamol 500mg (12 tablets)',
    category: 'Medicines',
    unit: 'pack',
    price: 450,
    cost: 300,
    target: 48,
    low: 10,
  },
  {
    key: 'ibuprofen',
    name: 'Ibuprofen 400mg (10 tablets)',
    category: 'Medicines',
    unit: 'pack',
    price: 600,
    cost: 420,
    target: 30,
    low: 8,
  },
  {
    key: 'vitamin-c',
    name: 'Vitamin C 1000mg (20 tablets)',
    category: 'Medicines',
    unit: 'tube',
    price: 1500,
    cost: 1050,
    target: 3,
    low: 5,
  },
  {
    key: 'ors',
    name: 'Oral rehydration salts',
    category: 'Medicines',
    unit: 'sachet',
    price: 300,
    cost: 180,
    target: 60,
    low: 15,
  },
  {
    key: 'cough-syrup',
    name: 'Cough syrup 100ml',
    category: 'Medicines',
    unit: 'bottle',
    price: 1800,
    cost: 1250,
    target: 14,
    low: 5,
  },
  {
    key: 'antacid',
    name: 'Antacid tablets',
    category: 'Medicines',
    unit: 'pack',
    price: 900,
    cost: 600,
    target: 22,
    low: 6,
  },
  {
    key: 'malaria-kit',
    name: 'Malaria test kit',
    category: 'Medicines',
    unit: 'kit',
    price: 2500,
    cost: 1700,
    target: 0,
    low: 4,
  },
  {
    key: 'plasters',
    name: 'Plasters (20 pack)',
    category: 'Medicines',
    unit: 'pack',
    price: 700,
    cost: 450,
    target: 2,
    low: 5,
  },
  {
    key: 'antiseptic',
    name: 'Antiseptic liquid 250ml',
    category: 'Medicines',
    unit: 'bottle',
    price: 2200,
    cost: 1500,
    target: 18,
    low: 5,
  },
  {
    key: 'multivitamin',
    name: 'Multivitamin syrup 200ml',
    category: 'Medicines',
    unit: 'bottle',
    price: 2800,
    cost: 2000,
    target: 11,
    low: 4,
  },
  // Personal care
  {
    key: 'toothpaste',
    name: 'Toothpaste 150g',
    category: 'Personal care',
    unit: 'tube',
    price: 1200,
    cost: 850,
    target: 26,
    low: 6,
  },
  {
    key: 'toothbrush',
    name: 'Toothbrush',
    category: 'Personal care',
    unit: 'piece',
    price: 500,
    cost: 300,
    target: 35,
    low: 8,
  },
  {
    key: 'soap',
    name: 'Bar soap',
    category: 'Personal care',
    unit: 'bar',
    price: 400,
    cost: 260,
    target: 52,
    low: 12,
  },
  {
    key: 'sanitiser',
    name: 'Hand sanitiser 100ml',
    category: 'Personal care',
    unit: 'bottle',
    price: 900,
    cost: 600,
    target: 20,
    low: 6,
  },
  {
    key: 'lotion',
    name: 'Body lotion 400ml',
    category: 'Personal care',
    unit: 'bottle',
    price: 3500,
    cost: 2600,
    target: 9,
    low: 3,
  },
  {
    key: 'deodorant',
    name: 'Deodorant spray',
    category: 'Personal care',
    unit: 'can',
    price: 2500,
    cost: 1800,
    target: 12,
    low: 4,
  },
  {
    key: 'pads',
    name: 'Sanitary pads',
    category: 'Personal care',
    unit: 'pack',
    price: 1300,
    cost: 900,
    target: 28,
    low: 8,
  },
  // Baby
  {
    key: 'diapers',
    name: 'Baby diapers, size 3 (30)',
    category: 'Baby',
    unit: 'pack',
    price: 9500,
    cost: 7600,
    target: 10,
    low: 3,
  },
  {
    key: 'wipes',
    name: 'Baby wipes',
    category: 'Baby',
    unit: 'pack',
    price: 1800,
    cost: 1200,
    target: 4,
    low: 5,
  },
  {
    key: 'formula',
    name: 'Baby formula 400g',
    category: 'Baby',
    unit: 'tin',
    price: 12500,
    cost: 10200,
    target: 0,
    low: 2,
  },
  {
    key: 'baby-powder',
    name: 'Baby powder',
    category: 'Baby',
    unit: 'bottle',
    price: 1500,
    cost: 1000,
    target: 15,
    low: 4,
  },
  {
    key: 'feeding-bottle',
    name: 'Feeding bottle',
    category: 'Baby',
    unit: 'piece',
    price: 2400,
    cost: 1600,
    target: 8,
    low: 2,
  },
  {
    key: 'gripe-water',
    name: 'Gripe water',
    category: 'Baby',
    unit: 'bottle',
    price: 1600,
    cost: 1100,
    target: 13,
    low: 4,
  },
  // Drinks
  {
    key: 'water',
    name: 'Bottled water 75cl',
    category: 'Drinks',
    unit: 'bottle',
    price: 250,
    cost: 150,
    target: 84,
    low: 24,
  },
  {
    key: 'malt',
    name: 'Malt drink 33cl',
    category: 'Drinks',
    unit: 'can',
    price: 600,
    cost: 430,
    target: 40,
    low: 12,
  },
  {
    key: 'juice',
    name: 'Orange juice 1L',
    category: 'Drinks',
    unit: 'carton',
    price: 2200,
    cost: 1600,
    target: 16,
    low: 5,
  },
  {
    key: 'energy',
    name: 'Energy drink',
    category: 'Drinks',
    unit: 'can',
    price: 900,
    cost: 650,
    target: 3,
    low: 6,
  },
  {
    key: 'soft-drink',
    name: 'Soft drink 50cl',
    category: 'Drinks',
    unit: 'bottle',
    price: 450,
    cost: 320,
    target: 46,
    low: 12,
  },
  {
    key: 'glucose',
    name: 'Glucose drink 400g',
    category: 'Drinks',
    unit: 'tin',
    price: 2800,
    cost: null,
    target: 9,
    low: 3,
  },
  // Snacks
  {
    key: 'biscuits',
    name: 'Biscuits',
    category: 'Snacks',
    unit: 'pack',
    price: 300,
    cost: 190,
    target: 70,
    low: 20,
  },
  {
    key: 'chocolate',
    name: 'Chocolate bar',
    category: 'Snacks',
    unit: 'bar',
    price: 800,
    cost: 550,
    target: 33,
    low: 10,
  },
  {
    key: 'plantain-chips',
    name: 'Plantain chips',
    category: 'Snacks',
    unit: 'pack',
    price: 500,
    cost: null,
    target: 25,
    low: 8,
  },
  {
    key: 'groundnuts',
    name: 'Roasted groundnuts',
    category: 'Snacks',
    unit: 'pack',
    price: 400,
    cost: null,
    target: 30,
    low: 8,
  },
  {
    key: 'cabin',
    name: 'Cabin biscuits',
    category: 'Snacks',
    unit: 'pack',
    price: 1000,
    cost: 700,
    target: 21,
    low: 6,
  },
  {
    key: 'sweets',
    name: 'Sweets (pack)',
    category: 'Snacks',
    unit: 'pack',
    price: 350,
    cost: 220,
    target: 44,
    low: 10,
  },
  // Household
  {
    key: 'insecticide',
    name: 'Insecticide spray',
    category: 'Household',
    unit: 'can',
    price: 3200,
    cost: 2400,
    target: 10,
    low: 3,
  },
  {
    key: 'coils',
    name: 'Mosquito coils',
    category: 'Household',
    unit: 'box',
    price: 600,
    cost: 400,
    target: 12,
    low: 4,
    archived: true,
  },
  {
    key: 'dish-soap',
    name: 'Dish soap',
    category: 'Household',
    unit: 'bottle',
    price: 900,
    cost: 600,
    target: 19,
    low: 5,
  },
  {
    key: 'toilet-roll',
    name: 'Toilet roll (4 pack)',
    category: 'Household',
    unit: 'pack',
    price: 1600,
    cost: 1150,
    target: 24,
    low: 6,
  },
  {
    key: 'bleach',
    name: 'Bleach 1L',
    category: 'Household',
    unit: 'bottle',
    price: 1400,
    cost: 950,
    target: 15,
    low: 4,
  },
]

/** Items that the week's restock, adjustment and voided order touch (never low or empty ones). */
const RESTOCKED = ['paracetamol', 'water', 'biscuits'] as const
const ADJUSTED = 'toothbrush'

const CUSTOMERS = ['Mrs Bello', 'Mr Okafor', 'Ngozi', 'Tunde', 'Aisha', 'Mr Danjuma'] as const

/** A small seeded random generator, so the demo is the same every time. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export interface SalesSeedInput {
  now: Date
  businessId: string
  timezone: string
  ownerId: string
  ownerName: string
  staff: readonly { id: string; name: string; weight: number }[]
  /** The staff member whose order is on hold. */
  heldBy: { id: string; name: string }
}

export interface SalesSeed {
  items: MockItem[]
  itemCosts: MockItemCost[]
  stockMovements: MockStockMovement[]
  orders: MockOrder[]
  heldOrders: MockHeldOrder[]
  orderCounter: number
}

type Event =
  | { kind: 'sale'; at: number; orderIndex: number }
  | { kind: 'void'; at: number; orderIndex: number }
  | { kind: 'restock'; at: number; itemKey: string; quantity: number; unitCost: number | null }
  | { kind: 'adjustment'; at: number; itemKey: string; delta: number }

export function createSalesSeed(input: SalesSeedInput): SalesSeed {
  const { now, businessId, timezone } = input
  const random = seededRandom(20261113)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)]!
  const iso = (ms: number) => new Date(ms).toISOString()
  const id = (prefix: string, index: number) => `${prefix}-${businessId}-${index}`
  const nowMs = now.getTime()

  const items: MockItem[] = CATALOGUE.map((entry, index) => ({
    id: id('item', index),
    businessId,
    name: entry.name,
    category: entry.category,
    unit: entry.unit,
    price: entry.price * 100,
    quantity: entry.target,
    lowStockLevel: entry.low,
    active: !entry.archived,
    createdAt: iso(nowMs - 8 * DAY_MS),
    updatedAt: iso(nowMs - 8 * DAY_MS),
  }))
  const itemByKey = new Map(CATALOGUE.map((entry, index) => [entry.key, items[index]!]))
  const entryById = new Map(CATALOGUE.map((entry, index) => [items[index]!.id, entry]))

  const itemCosts: MockItemCost[] = CATALOGUE.flatMap((entry, index) =>
    entry.cost === null
      ? []
      : [{ itemId: items[index]!.id, businessId, costPrice: entry.cost * 100 }],
  )

  // --- Orders: about a week, busiest in the afternoon -------------------------

  const sellable = items.filter((item) => item.active)
  const normal = sellable.filter((item) => {
    const entry = entryById.get(item.id)!
    return entry.target > entry.low
  })
  const staffPool = input.staff.flatMap((member) =>
    Array<typeof member>(member.weight).fill(member),
  )

  interface DraftOrder {
    at: number
    staff: { id: string; name: string }
    lines: { item: MockItem; quantity: number }[]
    paymentMethod: PaymentMethod
    customerName: string | null
  }
  const drafts: DraftOrder[] = []

  const draftOrder = (
    at: number,
    staff: { id: string; name: string },
    pool: readonly MockItem[],
  ) => {
    const lineCount = 1 + Math.floor(random() * 3)
    const chosen = new Map<string, { item: MockItem; quantity: number }>()
    for (let line = 0; line < lineCount; line += 1) {
      const item = pick(pool)
      const quantity = 1 + Math.floor(random() * 3)
      chosen.set(item.id, { item, quantity: (chosen.get(item.id)?.quantity ?? 0) + quantity })
    }
    const roll = random()
    drafts.push({
      at,
      staff,
      lines: [...chosen.values()],
      paymentMethod: roll < 0.45 ? 'cash' : roll < 0.8 ? 'bank_transfer' : 'card',
      customerName: random() < 0.3 ? pick(CUSTOMERS) : null,
    })
  }

  // Past six days: local trading hours, 9:00 to 19:30. Lagos is UTC+1 all year.
  const offsetHours = timezone === 'Africa/Lagos' ? 1 : 0
  for (let day = 6; day >= 1; day -= 1) {
    const dayStart = Date.UTC(
      new Date(nowMs - day * DAY_MS).getUTCFullYear(),
      new Date(nowMs - day * DAY_MS).getUTCMonth(),
      new Date(nowMs - day * DAY_MS).getUTCDate(),
    )
    const count = 6 + Math.floor(random() * 5)
    for (let index = 0; index < count; index += 1) {
      const localMinutes = 9 * 60 + Math.floor(random() * 630)
      const at = dayStart + (localMinutes - offsetHours * 60) * 60_000
      draftOrder(at, pick(staffPool), sellable)
    }
  }
  // Today: a few orders in the last two hours, mostly by the first staff member.
  for (let index = 0; index < 4; index += 1) {
    const at = nowMs - (index * 30 + 8) * 60_000
    const staff = index === 2 ? (input.staff[1] ?? input.staff[0]!) : input.staff[0]!
    draftOrder(at, staff, normal)
  }

  drafts.sort((a, b) => a.at - b.at)

  // One order two days ago is voided by the owner (only ordinary items, so the
  // returned stock never matters for the low or empty ones).
  const voidCandidates = drafts
    .map((draft, index) => ({ draft, index }))
    .filter(({ draft }) => {
      const age = nowMs - draft.at
      return (
        age > 1.5 * DAY_MS &&
        age < 2.5 * DAY_MS &&
        draft.lines.every((line) => normal.includes(line.item))
      )
    })
  const voided = voidCandidates[0]?.index ?? -1

  // --- Events, in time order --------------------------------------------------

  const events: Event[] = drafts.map((draft, orderIndex) => ({
    kind: 'sale' as const,
    at: draft.at,
    orderIndex,
  }))
  if (voided >= 0)
    events.push({ kind: 'void', at: drafts[voided]!.at + 3 * 3_600_000, orderIndex: voided })
  for (const key of RESTOCKED) {
    const entry = CATALOGUE.find((candidate) => candidate.key === key)!
    events.push({
      kind: 'restock',
      at: nowMs - 3 * DAY_MS - 5 * 3_600_000,
      itemKey: key,
      quantity: 24,
      unitCost: entry.cost === null ? null : entry.cost * 100,
    })
  }
  events.push({
    kind: 'adjustment',
    at: nowMs - 2 * DAY_MS - 2 * 3_600_000,
    itemKey: ADJUSTED,
    delta: -2,
  })
  events.sort((a, b) => a.at - b.at)

  /** Stock changes each event makes, per item. */
  const changesOf = (event: Event): { item: MockItem; delta: number }[] => {
    if (event.kind === 'sale')
      return drafts[event.orderIndex]!.lines.map((line) => ({
        item: line.item,
        delta: -line.quantity,
      }))
    if (event.kind === 'void')
      return drafts[event.orderIndex]!.lines.map((line) => ({
        item: line.item,
        delta: line.quantity,
      }))
    const item = itemByKey.get(event.itemKey)!
    return [{ item, delta: event.kind === 'restock' ? event.quantity : event.delta }]
  }

  // Opening stock = final quantity minus everything that happened, raised if
  // stock would ever have dipped below zero along the way.
  const opening = new Map<string, number>()
  for (const item of items) {
    let running = 0
    let lowest = 0
    for (const event of events) {
      for (const change of changesOf(event)) {
        if (change.item.id !== item.id) continue
        running += change.delta
        lowest = Math.min(lowest, running)
      }
    }
    const start = Math.max(item.quantity - running, -lowest)
    opening.set(item.id, start)
    item.quantity = start + running
  }

  // --- Write the ledger and the orders by replaying history ---------------------

  const stockMovements: MockStockMovement[] = []
  const quantity = new Map<string, number>()
  const movement = (
    item: MockItem,
    type: MovementType,
    delta: number,
    at: number,
    by: { id: string; name: string },
    extra: Partial<MockStockMovement> = {},
  ) => {
    const before = quantity.get(item.id) ?? 0
    quantity.set(item.id, before + delta)
    stockMovements.push({
      id: id('move', stockMovements.length),
      businessId,
      itemId: item.id,
      itemName: item.name,
      type,
      delta,
      quantityBefore: before,
      quantityAfter: before + delta,
      reason: null,
      note: null,
      orderId: null,
      restockId: null,
      supplier: null,
      unitCost: null,
      createdBy: by.id,
      createdByName: by.name,
      dateKey: dateKey(new Date(at), timezone),
      createdAt: iso(at),
      ...extra,
    })
  }

  const owner = { id: input.ownerId, name: input.ownerName }
  const openingAt = nowMs - 8 * DAY_MS
  for (const item of items) {
    const start = opening.get(item.id) ?? 0
    if (start > 0) movement(item, 'opening', start, openingAt, owner)
  }

  const orders: MockOrder[] = drafts.map((draft, index) => {
    const lines = draft.lines.map((line) => ({
      itemId: line.item.id,
      name: line.item.name,
      unitPrice: line.item.price,
      quantity: line.quantity,
      lineTotal: line.item.price * line.quantity,
    }))
    const reference =
      draft.paymentMethod === 'cash'
        ? null
        : `${draft.paymentMethod === 'card' ? 'POS' : 'TRF'}${100000 + Math.floor(random() * 899999)}`
    return {
      id: id('order', index),
      businessId,
      orderNumber: index + 1,
      clientOrderId: id('client-order', index),
      staffId: draft.staff.id,
      staffName: draft.staff.name,
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      paymentMethod: draft.paymentMethod,
      paymentReference: reference,
      paymentConfirmedBy: draft.staff.id,
      paymentConfirmedByName: draft.staff.name,
      paymentConfirmedAt: iso(draft.at),
      customerName: draft.customerName,
      customerPhone: null,
      note: null,
      status: 'completed',
      dateKey: dateKey(new Date(draft.at), timezone),
      createdAt: iso(draft.at),
      voidedAt: null,
      voidedBy: null,
      voidedByName: null,
      voidReason: null,
      lines,
    }
  })

  const restockId = id('restock', 0)
  for (const event of events) {
    if (event.kind === 'sale' || event.kind === 'void') {
      const order = orders[event.orderIndex]!
      for (const change of changesOf(event)) {
        const by = event.kind === 'sale' ? { id: order.staffId, name: order.staffName } : owner
        movement(change.item, event.kind, change.delta, event.at, by, { orderId: order.id })
      }
      if (event.kind === 'void') {
        Object.assign(order, {
          status: 'voided',
          voidedAt: iso(event.at),
          voidedBy: owner.id,
          voidedByName: owner.name,
          voidReason: 'Customer returned the items unopened.',
        })
      }
    } else if (event.kind === 'restock') {
      movement(itemByKey.get(event.itemKey)!, 'restock', event.quantity, event.at, owner, {
        restockId,
        supplier: 'MedSupply Ltd',
        unitCost: event.unitCost,
        note: 'Weekly delivery',
      })
    } else {
      movement(itemByKey.get(event.itemKey)!, 'adjustment', event.delta, event.at, owner, {
        reason: 'damaged',
        note: 'Two crushed in the delivery box.',
      })
    }
  }

  // A hold waiting for a bank transfer. It takes no stock.
  const heldAt = nowMs - 20 * 60_000
  const heldOrders: MockHeldOrder[] = [
    {
      id: id('held', 0),
      businessId,
      staffId: input.heldBy.id,
      staffName: input.heldBy.name,
      customerName: 'Mrs Bello',
      customerPhone: '0803 000 0002',
      note: 'Paying by transfer, waiting for the alert.',
      createdAt: iso(heldAt),
      updatedAt: iso(heldAt),
      lines: [
        { itemId: itemByKey.get('water')!.id, quantity: 6 },
        { itemId: itemByKey.get('biscuits')!.id, quantity: 4 },
      ],
    },
  ]

  return { items, itemCosts, stockMovements, orders, heldOrders, orderCounter: orders.length }
}
