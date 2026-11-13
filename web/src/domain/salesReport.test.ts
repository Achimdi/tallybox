import { describe, expect, it } from 'vitest'
import { csvAmount, csvCell, toCsv } from './csv'
import type { OrderFacts } from './reports'
import {
  bucketDays,
  buildSalesReport,
  granularityFor,
  isValidRange,
  rangeLength,
} from './salesReport'

const order = (overrides: Partial<OrderFacts>): OrderFacts => ({
  status: 'completed',
  dateKey: '2026-11-10',
  total: 1000,
  paymentMethod: 'cash',
  staffId: 'ada',
  staffName: 'Ada',
  lines: [{ itemId: 'water', name: 'Water', quantity: 1, lineTotal: 1000 }],
  ...overrides,
})

const catalogue = [
  { id: 'water', name: 'Water', quantity: 10, price: 1000, active: true },
  { id: 'bread', name: 'Bread', quantity: 4, price: 2500, active: true },
  { id: 'old', name: 'Old stock', quantity: 9, price: 100, active: false },
]

describe('sales report', () => {
  const range = { from: '2026-11-09', to: '2026-11-11' }
  const orders = [
    order({}),
    order({ total: 3000, paymentMethod: 'bank_transfer', staffId: 'bola', staffName: 'Bola' }),
    order({ status: 'voided', total: 500 }),
    order({ dateKey: '2026-11-08', total: 99999 }),
  ]
  const report = buildSalesReport(orders, range, catalogue, { water: 400 })

  it('counts completed orders in the range only, with voids apart', () => {
    expect(report).toMatchObject({
      sales: 4000,
      orders: 2,
      averageOrder: 2000,
      voided: 1,
      voidedTotal: 500,
    })
  })

  it('splits by payment method and by staff, biggest first', () => {
    expect(report.byPaymentMethod.cash).toEqual({ sales: 1000, orders: 1 })
    expect(report.byPaymentMethod.bank_transfer).toEqual({ sales: 3000, orders: 1 })
    expect(report.byPaymentMethod.card).toEqual({ sales: 0, orders: 0 })
    expect(report.byStaff.map((entry) => entry.staffName)).toEqual(['Bola', 'Ada'])
  })

  it('has every day in the range, even quiet ones', () => {
    expect(report.byDay).toEqual([
      { dateKey: '2026-11-09', sales: 0, orders: 0 },
      { dateKey: '2026-11-10', sales: 4000, orders: 2 },
      { dateKey: '2026-11-11', sales: 0, orders: 0 },
    ])
  })

  it('lists sellers first, then items on sale that sold nothing, never archived ones', () => {
    expect(report.items.map((entry) => [entry.name, entry.sales])).toEqual([
      ['Water', 2000],
      ['Bread', 0],
    ])
  })

  it('values stock for items with a cost price only', () => {
    expect(report.stockValue).toEqual({
      atCost: 4000,
      atPrice: 10000,
      itemsWithCost: 1,
      itemsWithoutCost: 1,
    })
    expect(buildSalesReport([], range, catalogue, {}).stockValue).toBeNull()
  })

  it('gives an average of 0 when nothing sold', () => {
    expect(buildSalesReport([], range, catalogue, {}).averageOrder).toBe(0)
  })
})

describe('report ranges', () => {
  it('counts both ends and refuses backwards, malformed or over-long ranges', () => {
    expect(rangeLength({ from: '2026-11-01', to: '2026-11-30' })).toBe(30)
    expect(isValidRange({ from: '2026-11-01', to: '2026-11-01' })).toBe(true)
    expect(isValidRange({ from: '2026-11-02', to: '2026-11-01' })).toBe(false)
    expect(isValidRange({ from: '2026-1-1', to: '2026-11-01' })).toBe(false)
    expect(isValidRange({ from: '2025-01-01', to: '2026-11-01' })).toBe(false)
  })

  it('groups long ranges into weeks or months so charts stay readable', () => {
    expect(granularityFor({ from: '2026-11-01', to: '2026-11-30' })).toBe('day')
    expect(granularityFor({ from: '2026-06-01', to: '2026-11-30' })).toBe('week')
    expect(granularityFor({ from: '2026-01-01', to: '2026-11-30' })).toBe('month')

    const days = [
      { dateKey: '2026-11-07', sales: 1, orders: 1 }, // Saturday
      { dateKey: '2026-11-08', sales: 2, orders: 1 }, // Sunday
      { dateKey: '2026-11-09', sales: 4, orders: 2 }, // Monday
    ]
    expect(bucketDays(days, 'week')).toEqual([
      { dateKey: '2026-11-07', sales: 3, orders: 2 },
      { dateKey: '2026-11-09', sales: 4, orders: 2 },
    ])
    expect(bucketDays(days, 'month')).toEqual([{ dateKey: '2026-11-07', sales: 7, orders: 4 }])
  })
})

describe('CSV', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(csvCell('Water, 75cl')).toBe('"Water, 75cl"')
    expect(csvCell('5" nails')).toBe('"5"" nails"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(null)).toBe('')
    expect(csvCell(12)).toBe('12')
  })

  it('stops text from running as a spreadsheet formula, but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+234 801')).toBe("'+234 801")
    expect(csvCell('@sum')).toBe("'@sum")
    expect(csvCell('-12.50')).toBe('-12.50')
  })

  it('writes a BOM, a header and CRLF rows', () => {
    const csv = toCsv(['a', 'b'], [[1, 'x']])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1)).toBe('a,b\r\n1,x\r\n')
  })

  it('writes amounts as plain decimals', () => {
    expect(csvAmount(45000, 2)).toBe('450.00')
    expect(csvAmount(5, 2)).toBe('0.05')
    expect(csvAmount(1500, 0)).toBe('1500')
    expect(csvAmount(1234, 3)).toBe('1.234')
  })
})
