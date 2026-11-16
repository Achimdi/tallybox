import { describe, expect, it } from 'vitest'
import {
  addToCart,
  cartCount,
  checkOrder,
  describeStockProblems,
  formatOrderNumber,
  normalizeCart,
  paymentMethodLabel,
  setCartQuantity,
  type StockFacts,
} from './orders'

const own = { tracksOwnStock: true, supplies: [] }
const items = new Map<string, StockFacts>([
  ['para', { id: 'para', name: 'Paracetamol', price: 45000, quantity: 10, active: true, ...own }],
  ['water', { id: 'water', name: 'Water', price: 25000, quantity: 0, active: true, ...own }],
  ['old', { id: 'old', name: 'Old Stock', price: 1000, quantity: 50, active: false, ...own }],
])

describe('normalizeCart', () => {
  it('merges repeated items and drops empty lines', () => {
    expect(
      normalizeCart([
        { itemId: 'a', quantity: 2 },
        { itemId: 'b', quantity: 0 },
        { itemId: 'a', quantity: 3 },
      ]),
    ).toEqual([{ itemId: 'a', quantity: 5 }])
  })

  it('refuses fractions, negatives and silly amounts', () => {
    expect(normalizeCart([{ itemId: 'a', quantity: 1.5 }])).toBeNull()
    expect(normalizeCart([{ itemId: 'a', quantity: -1 }])).toBeNull()
    expect(normalizeCart([{ itemId: 'a', quantity: 10_001 }])).toBeNull()
  })
})

describe('checkOrder', () => {
  it('prices every line from the item list, not from the cart', () => {
    expect(checkOrder([{ itemId: 'para', quantity: 3 }], items)).toEqual({
      ok: true,
      lines: [
        { itemId: 'para', name: 'Paracetamol', unitPrice: 45000, quantity: 3, lineTotal: 135000 },
      ],
      total: 135000,
      supplyDeductions: [],
    })
  })

  it('names every line that is short of stock', () => {
    expect(
      checkOrder(
        [
          { itemId: 'para', quantity: 11 },
          { itemId: 'water', quantity: 1 },
        ],
        items,
      ),
    ).toEqual({
      ok: false,
      reason: 'insufficient_stock',
      problems: [
        { itemId: 'para', name: 'Paracetamol', available: 10, requested: 11 },
        { itemId: 'water', name: 'Water', available: 0, requested: 1 },
      ],
      supplyProblems: [],
    })
  })

  it('refuses archived or unknown items', () => {
    expect(checkOrder([{ itemId: 'old', quantity: 1 }], items)).toEqual({
      ok: false,
      reason: 'item_unavailable',
      names: ['Old Stock'],
    })
    expect(checkOrder([{ itemId: 'gone', quantity: 1 }], items)).toMatchObject({
      reason: 'item_unavailable',
    })
  })
})

describe('the cart', () => {
  it('adds one at a time, never beyond the stock on hand', () => {
    let lines = addToCart([], 'para', 2)
    lines = addToCart(lines, 'para', 2)
    lines = addToCart(lines, 'para', 2)
    expect(lines).toEqual([{ itemId: 'para', quantity: 2 }])
    expect(addToCart([], 'water', 0)).toEqual([])
  })

  it('sets and removes quantities, and counts items', () => {
    let lines = addToCart(addToCart([], 'a', 5), 'b', 5)
    lines = setCartQuantity(lines, 'a', 4)
    expect(cartCount(lines)).toBe(5)
    expect(setCartQuantity(lines, 'a', 0)).toEqual([{ itemId: 'b', quantity: 1 }])
  })
})

describe('wording', () => {
  it('formats order numbers and payment methods', () => {
    expect(formatOrderNumber(42)).toBe('#0042')
    expect(formatOrderNumber(12345)).toBe('#12345')
    expect(paymentMethodLabel('bank_transfer')).toBe('Bank transfer')
  })

  it('explains stock problems in one sentence', () => {
    expect(
      describeStockProblems([
        { itemId: 'p', name: 'Paracetamol', available: 3, requested: 5 },
        { itemId: 'w', name: 'Water', available: 0, requested: 1 },
      ]),
    ).toBe('Not enough stock: Paracetamol (3 left), Water (none left).')
  })
})
