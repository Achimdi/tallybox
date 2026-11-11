import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  lineTotal,
  minorToInputValue,
  minorUnitDigits,
  parseMoney,
  sumMinor,
} from './money'

describe('minorUnitDigits', () => {
  it('knows how many decimals each currency uses', () => {
    expect(minorUnitDigits('NGN')).toBe(2)
    expect(minorUnitDigits('USD')).toBe(2)
    expect(minorUnitDigits('JPY')).toBe(0)
    expect(minorUnitDigits('KWD')).toBe(3)
  })
})

describe('formatMoney', () => {
  it('formats minor units in the business currency', () => {
    expect(formatMoney(125050, 'NGN')).toBe('₦1,250.50')
    expect(formatMoney(0, 'NGN')).toBe('₦0.00')
    expect(formatMoney(99, 'USD')).toBe('$0.99')
  })

  it('handles currencies with no minor unit', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500')
  })

  it('shows negative amounts', () => {
    expect(formatMoney(-2500, 'USD')).toBe('-$25.00')
  })
})

describe('parseMoney', () => {
  it('turns typed amounts into minor units', () => {
    expect(parseMoney('1250.50', 'NGN')).toBe(125050)
    expect(parseMoney('1,250.50', 'NGN')).toBe(125050)
    expect(parseMoney(' 1 250 ', 'NGN')).toBe(125000)
    expect(parseMoney('0.5', 'NGN')).toBe(50)
    expect(parseMoney('7.', 'NGN')).toBe(700)
    expect(parseMoney('0', 'NGN')).toBe(0)
  })

  it('avoids floating-point mistakes', () => {
    // 0.1 + 0.2 !== 0.3 in floating point. Whole-number maths gets it right.
    expect(parseMoney('0.10', 'USD')! + parseMoney('0.20', 'USD')!).toBe(30)
    expect(parseMoney('1.15', 'USD')).toBe(115)
    expect(parseMoney('4.35', 'USD')).toBe(435)
  })

  it('rejects anything that is not a valid amount', () => {
    expect(parseMoney('', 'NGN')).toBeNull()
    expect(parseMoney('abc', 'NGN')).toBeNull()
    expect(parseMoney('-5', 'NGN')).toBeNull()
    expect(parseMoney('1.2.3', 'NGN')).toBeNull()
    expect(parseMoney('.50', 'NGN')).toBeNull()
    expect(parseMoney('1e3', 'NGN')).toBeNull()
  })

  it('rejects more decimals than the currency has', () => {
    expect(parseMoney('1.234', 'NGN')).toBeNull()
    expect(parseMoney('1.5', 'JPY')).toBeNull()
    expect(parseMoney('1.234', 'KWD')).toBe(1234)
  })

  it('rejects amounts too large to hold exactly', () => {
    expect(parseMoney('99999999999999999999', 'NGN')).toBeNull()
  })
})

describe('minorToInputValue', () => {
  it('writes minor units as plain text for an input', () => {
    expect(minorToInputValue(125050, 'NGN')).toBe('1250.50')
    expect(minorToInputValue(5, 'NGN')).toBe('0.05')
    expect(minorToInputValue(1500, 'JPY')).toBe('1500')
  })

  it('round-trips with parseMoney', () => {
    for (const minor of [0, 1, 99, 100, 125050, 999999999]) {
      expect(parseMoney(minorToInputValue(minor, 'NGN'), 'NGN')).toBe(minor)
    }
  })
})

describe('totals', () => {
  it('multiplies and adds in whole minor units', () => {
    expect(lineTotal(45000, 3)).toBe(135000)
    expect(sumMinor([135000, 25000, 5])).toBe(160005)
    expect(sumMinor([])).toBe(0)
  })
})
