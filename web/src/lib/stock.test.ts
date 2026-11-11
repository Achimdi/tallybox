import { describe, expect, it } from 'vitest'
import { stockStatus } from './stock'

describe('stockStatus', () => {
  it('is out of stock at zero', () => {
    expect(stockStatus(0, 5)).toBe('out_of_stock')
    expect(stockStatus(0, 0)).toBe('out_of_stock')
  })

  it('is low at or below the low-stock level', () => {
    expect(stockStatus(5, 5)).toBe('low_stock')
    expect(stockStatus(1, 5)).toBe('low_stock')
  })

  it('is in stock above the low-stock level', () => {
    expect(stockStatus(6, 5)).toBe('in_stock')
    expect(stockStatus(1, 0)).toBe('in_stock')
  })
})
