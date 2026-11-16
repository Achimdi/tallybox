import { dateKey } from '@/lib/dates'
import type { PaymentMethod } from '@/domain/orders'
import type {
  MockItem,
  MockItemCost,
  MockItemSupply,
  MockOrder,
  MockStockMovement,
  MockSupply,
  MockSupplyCost,
} from './store'

const DAY_MS = 86_400_000

interface DrinksSeedInput {
  now: Date
  businessId: string
  timezone: string
  owner: { id: string; name: string }
  staff: { id: string; name: string }
}

export interface DrinksSeed {
  items: MockItem[]
  itemCosts: MockItemCost[]
  supplies: MockSupply[]
  supplyCosts: MockSupplyCost[]
  itemSupplies: MockItemSupply[]
  stockMovements: MockStockMovement[]
  orders: MockOrder[]
  orderCounter: number
}

/**
 * Green Leaf Restaurant: drinks that share 1,000 × 300 ml bottles and caps,
 * food made to order (not counted), and one item that counts its own stock.
 * Apple juice does both: its own 800 and the shared bottles and caps.
 * Every quantity equals the sum of its ledger, as in a real business.
 */
export function createDrinksSeed(input: DrinksSeedInput): DrinksSeed {
  const { now, businessId, timezone, owner, staff } = input
  const nowMs = now.getTime()
  const iso = (ms: number) => new Date(ms).toISOString()
  const openedAt = nowMs - 3 * DAY_MS
  let counter = 0
  const id = (prefix: string) => `${prefix}-${businessId}-${(counter += 1)}`

  const supply = (key: string, name: string, unit: string, low: number): MockSupply => ({
    id: `supply-${businessId}-${key}`,
    businessId,
    name,
    unit,
    quantity: 0,
    lowStockLevel: low,
    active: true,
    createdAt: iso(openedAt),
    updatedAt: iso(openedAt),
  })
  const bottle = supply('bottle', '300 ml bottle', 'bottle', 100)
  const cap = supply('cap', 'Bottle cap', 'cap', 100)
  const supplies = [bottle, cap]

  const item = (
    key: string,
    name: string,
    category: string,
    price: number,
    tracksOwnStock: boolean,
    lowStockLevel = 10,
  ): MockItem => ({
    id: `item-${businessId}-${key}`,
    businessId,
    name,
    category,
    unit: null,
    price: price * 100,
    tracksOwnStock,
    quantity: 0,
    lowStockLevel,
    active: true,
    createdAt: iso(openedAt),
    updatedAt: iso(openedAt),
  })
  const coke = item('coke', 'Coke 300ml', 'Drinks', 500, false)
  const fanta = item('fanta', 'Fanta 300ml', 'Drinks', 500, false)
  const zobo = item('zobo', 'Zobo 300ml', 'Drinks', 400, false)
  const apple = item('apple', 'Apple juice 300ml', 'Drinks', 800, true, 50)
  const jollof = item('jollof', 'Jollof rice', 'Food', 2500, false)
  const friedRice = item('fried-rice', 'Fried rice', 'Food', 2500, false)
  const chicken = item('chicken', 'Grilled chicken', 'Food', 3000, true, 10)
  const items = [apple, coke, fanta, friedRice, chicken, jollof, zobo]

  const itemSupplies: MockItemSupply[] = [coke, fanta, zobo, apple].flatMap((drink) => [
    { itemId: drink.id, supplyId: bottle.id, businessId, unitsPerSale: 1 },
    { itemId: drink.id, supplyId: cap.id, businessId, unitsPerSale: 1 },
  ])
  const usesOf = (target: MockItem) => itemSupplies.filter((use) => use.itemId === target.id)

  const stockMovements: MockStockMovement[] = []
  const move = (
    target: { kind: 'item'; record: MockItem } | { kind: 'supply'; record: MockSupply },
    type: MockStockMovement['type'],
    delta: number,
    at: number,
    by: { id: string; name: string },
    extra: Partial<MockStockMovement> = {},
  ) => {
    const before = target.record.quantity
    target.record.quantity = before + delta
    stockMovements.push({
      id: id('move'),
      businessId,
      itemId: target.kind === 'item' ? target.record.id : null,
      supplyId: target.kind === 'supply' ? target.record.id : null,
      itemName: target.record.name,
      sourceItemId: null,
      sourceItemName: null,
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

  // Opening counts: nothing is deducted when items or supplies are created.
  move({ kind: 'supply', record: bottle }, 'opening', 1000, openedAt, owner)
  move({ kind: 'supply', record: cap }, 'opening', 1000, openedAt, owner)
  move({ kind: 'item', record: apple }, 'opening', 800, openedAt, owner)
  move({ kind: 'item', record: chicken }, 'opening', 40, openedAt, owner)

  // A few orders, each deducting own stock and every shared supply line by line.
  const orders: MockOrder[] = []
  const sell = (
    at: number,
    by: { id: string; name: string },
    paymentMethod: PaymentMethod,
    cart: [MockItem, number][],
  ) => {
    const orderId = id('order')
    const lines = cart.map(([sold, quantity]) => ({
      itemId: sold.id,
      name: sold.name,
      unitPrice: sold.price,
      quantity,
      lineTotal: sold.price * quantity,
    }))
    for (const [sold, quantity] of cart) {
      if (sold.tracksOwnStock)
        move({ kind: 'item', record: sold }, 'sale', -quantity, at, by, { orderId })
      for (const use of usesOf(sold)) {
        const used = supplies.find((candidate) => candidate.id === use.supplyId)!
        move({ kind: 'supply', record: used }, 'sale', -quantity * use.unitsPerSale, at, by, {
          orderId,
          sourceItemId: sold.id,
          sourceItemName: sold.name,
        })
      }
    }
    orders.push({
      id: orderId,
      businessId,
      orderNumber: orders.length + 1,
      clientOrderId: id('client-order'),
      staffId: by.id,
      staffName: by.name,
      total: lines.reduce((sum, line) => sum + line.lineTotal, 0),
      paymentMethod,
      paymentReference: paymentMethod === 'cash' ? null : `TRF${200100 + orders.length}`,
      paymentConfirmedBy: by.id,
      paymentConfirmedByName: by.name,
      paymentConfirmedAt: iso(at),
      customerName: null,
      customerPhone: null,
      note: null,
      status: 'completed',
      dateKey: dateKey(new Date(at), timezone),
      createdAt: iso(at),
      voidedAt: null,
      voidedBy: null,
      voidedByName: null,
      voidReason: null,
      lines,
    })
  }

  // The brief's example: 10 Coke + 10 apple juice + 10 Fanta use 30 bottles.
  sell(nowMs - DAY_MS - 3 * 3_600_000, staff, 'cash', [
    [coke, 10],
    [apple, 10],
    [fanta, 10],
  ])
  sell(nowMs - DAY_MS - 3_600_000, owner, 'bank_transfer', [
    [jollof, 3],
    [chicken, 2],
    [zobo, 3],
  ])
  sell(nowMs - 2 * 3_600_000, staff, 'cash', [
    [zobo, 4],
    [friedRice, 2],
    [chicken, 1],
    [coke, 2],
  ])

  return {
    items,
    itemCosts: [
      { itemId: apple.id, businessId, costPrice: 35000 },
      { itemId: chicken.id, businessId, costPrice: 150000 },
    ],
    supplies,
    supplyCosts: [
      { supplyId: bottle.id, businessId, costPrice: 6000 },
      { supplyId: cap.id, businessId, costPrice: 1000 },
    ],
    itemSupplies,
    stockMovements,
    orders,
    orderCounter: orders.length,
  }
}
