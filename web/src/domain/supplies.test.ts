import { describe, expect, it } from 'vitest'
import { checkOrder, type StockFacts } from './orders'
import {
  availableToSell,
  describeSupplyProblem,
  joinNames,
  roomInCart,
  stockModeLabel,
  supplyNeeds,
  validSupplyUses,
  type SupplyFacts,
} from './supplies'

/** A drinks business: 1,000 bottles and caps shared by three drinks. */
const supplies = new Map<string, SupplyFacts>([
  ['bottle', { id: 'bottle', name: '300 ml bottle', unit: 'bottle', quantity: 1000, active: true }],
  ['cap', { id: 'cap', name: 'Bottle cap', unit: 'cap', quantity: 1000, active: true }],
  ['old', { id: 'old', name: 'Old crate', unit: null, quantity: 50, active: false }],
])

const drink = (id: string, name: string, extra: Partial<StockFacts> = {}): StockFacts => ({
  id,
  name,
  price: 50000,
  active: true,
  tracksOwnStock: false,
  quantity: 0,
  supplies: [
    { supplyId: 'bottle', unitsPerSale: 1 },
    { supplyId: 'cap', unitsPerSale: 1 },
  ],
  ...extra,
})

const items = new Map<string, StockFacts>([
  ['coke', drink('coke', 'Coke')],
  ['fanta', drink('fanta', 'Fanta')],
  // Both: its own stock of 800 and the shared bottle.
  [
    'apple',
    drink('apple', 'Apple juice', {
      tracksOwnStock: true,
      quantity: 800,
      supplies: [{ supplyId: 'bottle', unitsPerSale: 1 }],
    }),
  ],
  // Neither: food made to order.
  ['rice', drink('rice', 'Jollof rice', { supplies: [] })],
  ['crate', drink('crate', 'Crate deal', { supplies: [{ supplyId: 'bottle', unitsPerSale: 12 }] })],
  ['stale', drink('stale', 'Old drink', { supplies: [{ supplyId: 'old', unitsPerSale: 1 }] })],
])

describe('what can be sold', () => {
  it('is the lowest of own stock and each supply ÷ units per sale', () => {
    expect(availableToSell(items.get('coke')!, supplies)).toBe(1000)
    expect(availableToSell(items.get('apple')!, supplies)).toBe(800)
    expect(availableToSell(items.get('crate')!, supplies)).toBe(83) // 1000 ÷ 12, rounded down
  })

  it('is unlimited for items that count nothing, and none for archived supplies', () => {
    expect(availableToSell(items.get('rice')!, supplies)).toBeNull()
    expect(availableToSell(items.get('stale')!, supplies)).toBe(0)
  })
})

describe('a cart sharing supplies', () => {
  const cart = [
    { itemId: 'coke', quantity: 10 },
    { itemId: 'apple', quantity: 10 },
    { itemId: 'fanta', quantity: 10 },
  ]

  it('adds up every line before checking: 30 drinks use 30 bottles', () => {
    expect(supplyNeeds(cart, items)).toEqual(
      new Map([
        ['bottle', 30],
        ['cap', 20],
      ]),
    )
  })

  it('deducts each supply per line, linked to the item that used it', () => {
    const check = checkOrder(cart, items, supplies)
    expect(check.ok).toBe(true)
    if (check.ok) {
      expect(check.supplyDeductions).toEqual([
        { supplyId: 'bottle', itemId: 'coke', quantity: 10 },
        { supplyId: 'cap', itemId: 'coke', quantity: 10 },
        { supplyId: 'bottle', itemId: 'apple', quantity: 10 },
        { supplyId: 'bottle', itemId: 'fanta', quantity: 10 },
        { supplyId: 'cap', itemId: 'fanta', quantity: 10 },
      ])
    }
  })

  it('leaves less room for other drinks once the cart uses the bottles', () => {
    const few = new Map(supplies)
    few.set('bottle', { ...supplies.get('bottle')!, quantity: 25 })
    expect(roomInCart('fanta', cart.slice(0, 2), items, few)).toBe(5)
    expect(roomInCart('apple', cart.slice(0, 2), items, few)).toBe(5)
    expect(roomInCart('rice', cart, items, few)).toBeNull()
  })

  it('refuses a cart needing more of a supply than is left, naming the items that share it', () => {
    const few = new Map(supplies)
    few.set('bottle', { ...supplies.get('bottle')!, quantity: 15 })
    const check = checkOrder(cart, items, few)
    expect(check).toMatchObject({ ok: false, reason: 'insufficient_stock', problems: [] })
    if (!check.ok && check.reason === 'insufficient_stock') {
      expect(check.supplyProblems).toEqual([
        {
          supplyId: 'bottle',
          name: '300 ml bottle',
          unit: 'bottle',
          needed: 30,
          available: 15,
          itemNames: ['Coke', 'Apple juice', 'Fanta'],
        },
      ])
      expect(describeSupplyProblem(check.supplyProblems[0]!)).toBe(
        'Not enough 300 ml bottle: 30 needed, 15 left. Coke, Apple juice and Fanta use it.',
      )
    }
  })

  it("says whether it is the item's own stock or a shared supply that is short", () => {
    const check = checkOrder([{ itemId: 'apple', quantity: 801 }], items, supplies)
    expect(check).toMatchObject({
      reason: 'insufficient_stock',
      problems: [{ itemId: 'apple', available: 800, requested: 801 }],
      supplyProblems: [],
    })
  })

  it('never limits items that count nothing', () => {
    expect(checkOrder([{ itemId: 'rice', quantity: 5000 }], items, supplies)).toMatchObject({
      ok: true,
    })
  })
})

describe('supply settings on an item', () => {
  it('accepts each supply once, with whole units of at least 1', () => {
    expect(validSupplyUses([{ supplyId: 'bottle', unitsPerSale: 1 }])).toBe(true)
    expect(validSupplyUses([])).toBe(true)
    expect(
      validSupplyUses([
        { supplyId: 'bottle', unitsPerSale: 1 },
        { supplyId: 'bottle', unitsPerSale: 2 },
      ]),
    ).toBe(false)
    expect(validSupplyUses([{ supplyId: 'bottle', unitsPerSale: 0 }])).toBe(false)
    expect(validSupplyUses([{ supplyId: 'bottle', unitsPerSale: 1.5 }])).toBe(false)
  })

  it('describes how stock is counted', () => {
    expect(stockModeLabel({ tracksOwnStock: true, supplies: [] })).toBe('Own stock')
    expect(stockModeLabel({ tracksOwnStock: false, supplies: [1] })).toBe('Shared supplies')
    expect(stockModeLabel({ tracksOwnStock: true, supplies: [1] })).toBe(
      'Own stock and shared supplies',
    )
    expect(stockModeLabel({ tracksOwnStock: false, supplies: [] })).toBe('Not counted')
  })

  it('joins names in plain English', () => {
    expect(joinNames(['Coke'])).toBe('Coke')
    expect(joinNames(['Coke', 'Fanta'])).toBe('Coke and Fanta')
    expect(joinNames(['Coke', 'Fanta', 'Zobo'])).toBe('Coke, Fanta and Zobo')
  })
})
