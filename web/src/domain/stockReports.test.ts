import { describe, expect, it } from 'vitest'
import { monthStart, weekStart } from '@/lib/dates'
import { itemSales, summarizeDay, trendAgainst, type OrderFacts } from './reports'
import { describeAdjustment, formatDelta, restockLinesProblem, stockValue } from './stock'

const order = (overrides: Partial<OrderFacts>): OrderFacts => ({
  status: 'completed',
  dateKey: '2026-11-13',
  total: 1000,
  paymentMethod: 'cash',
  staffId: 'ada',
  staffName: 'Ada',
  lines: [{ itemId: 'water', name: 'Water', quantity: 4, lineTotal: 1000 }],
  ...overrides,
})

describe('summarizeDay', () => {
  it('counts completed orders as sales and voided ones separately', () => {
    const summary = summarizeDay(
      [
        order({ total: 1000 }),
        order({ total: 2500, paymentMethod: 'bank_transfer' }),
        order({ total: 700, status: 'voided' }),
        order({ total: 9999, dateKey: '2026-11-12' }),
      ],
      '2026-11-13',
    )
    expect(summary).toEqual({
      dateKey: '2026-11-13',
      sales: 3500,
      orders: 2,
      voided: 1,
      voidedTotal: 700,
      byPaymentMethod: { cash: 1000, bank_transfer: 2500, card: 0 },
    })
  })
})

describe('itemSales', () => {
  it('ranks items by amount sold, ignoring voided orders', () => {
    const ranked = itemSales(
      [
        order({}),
        order({
          lines: [{ itemId: 'formula', name: 'Formula', quantity: 1, lineTotal: 12500 }],
          total: 12500,
        }),
        order({
          status: 'voided',
          lines: [{ itemId: 'lotion', name: 'Lotion', quantity: 9, lineTotal: 99999 }],
        }),
      ],
      () => true,
    )
    expect(ranked.map((entry) => entry.name)).toEqual(['Formula', 'Water'])
  })
})

describe('trendAgainst', () => {
  it('describes the change against yesterday in words', () => {
    expect(trendAgainst(1200, 1000, 'percent')).toEqual({
      direction: 'up',
      label: '20% up on yesterday',
    })
    expect(trendAgainst(500, 1000, 'percent')).toEqual({
      direction: 'down',
      label: '50% down on yesterday',
    })
    expect(trendAgainst(3, 5, 'count')).toEqual({
      direction: 'down',
      label: '2 fewer than yesterday',
    })
    expect(trendAgainst(7, 7, 'count')).toEqual({ direction: 'flat', label: 'Same as yesterday' })
    expect(trendAgainst(10, 0, 'percent')).toEqual({ direction: 'up', label: 'None yesterday' })
  })
})

describe('stock helpers', () => {
  it('always shows the sign of a change', () => {
    expect(formatDelta(24)).toBe('+24')
    expect(formatDelta(-3)).toBe('−3')
  })

  it('describes an adjustment before it is saved', () => {
    expect(describeAdjustment(48, 45)).toBe('−3 (from 48 to 45)')
    expect(describeAdjustment(48, 48)).toBeNull()
  })

  it('checks restock lines', () => {
    expect(restockLinesProblem([])).toBe('empty')
    expect(
      restockLinesProblem([
        { itemId: 'a', quantity: 2, unitCost: null },
        { itemId: 'a', quantity: 1, unitCost: null },
      ]),
    ).toBe('duplicate')
    expect(restockLinesProblem([{ itemId: 'a', quantity: 0, unitCost: null }])).toBe('quantity')
    expect(restockLinesProblem([{ itemId: 'a', quantity: 2.5, unitCost: null }])).toBe('quantity')
    expect(restockLinesProblem([{ itemId: 'a', quantity: 2, unitCost: -1 }])).toBe('cost')
    expect(restockLinesProblem([{ itemId: 'a', quantity: 2, unitCost: 300 }])).toBeNull()
  })

  it('values stock at cost, for active items with a cost price', () => {
    expect(
      stockValue(
        [
          { id: 'a', quantity: 10, active: true },
          { id: 'b', quantity: 5, active: true },
          { id: 'c', quantity: 99, active: false },
        ],
        { a: 300, c: 1000 },
      ),
    ).toEqual({ value: 3000, itemsWithCost: 1, itemsWithoutCost: 1 })
  })
})

describe('week and month starts', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-13')).toBe('2026-11-09') // Friday
    expect(weekStart('2026-11-09')).toBe('2026-11-09') // Monday
    expect(weekStart('2026-11-15')).toBe('2026-11-09') // Sunday
  })

  it('months start on the 1st', () => {
    expect(monthStart('2026-11-13')).toBe('2026-11-01')
  })
})
