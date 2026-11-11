import { describe, expect, it } from 'vitest'
import {
  addDays,
  dateKey,
  formatDate,
  formatDateKey,
  formatDateTime,
  isDateKey,
  isValidTimeZone,
} from './dates'

describe('dateKey', () => {
  it("gives the business's own calendar day, not the UTC day", () => {
    // 23:30 UTC on the 10th is already 00:30 on the 11th in Lagos (UTC+1).
    const instant = new Date('2026-11-10T23:30:00Z')
    expect(dateKey(instant, 'UTC')).toBe('2026-11-10')
    expect(dateKey(instant, 'Africa/Lagos')).toBe('2026-11-11')
    expect(dateKey(instant, 'America/New_York')).toBe('2026-11-10')
  })

  it('handles the other side of midnight', () => {
    const instant = new Date('2026-01-01T02:00:00Z')
    expect(dateKey(instant, 'America/Los_Angeles')).toBe('2025-12-31')
    expect(dateKey(instant, 'Asia/Tokyo')).toBe('2026-01-01')
  })
})

describe('isDateKey', () => {
  it('accepts real dates only', () => {
    expect(isDateKey('2026-11-11')).toBe(true)
    expect(isDateKey('2024-02-29')).toBe(true)
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('11/11/2026')).toBe(false)
    expect(isDateKey('')).toBe(false)
  })
})

describe('addDays', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-11-11', -1)).toBe('2026-11-10')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-11-11', -7)).toBe('2026-11-04')
  })

  it('refuses an invalid key', () => {
    expect(() => addDays('not-a-date', 1)).toThrow(RangeError)
  })
})

describe('formatting', () => {
  const instant = new Date('2026-11-11T13:05:00Z')

  it('formats in the business timezone', () => {
    expect(formatDate(instant, 'Africa/Lagos')).toBe('Nov 11, 2026')
    expect(formatDateTime(instant, 'Africa/Lagos')).toMatch(/^Nov 11, 2026, 2:05\sPM$/)
  })

  it('formats a date key as a readable day', () => {
    expect(formatDateKey('2026-11-11')).toBe('Wed, Nov 11, 2026')
    expect(formatDateKey('nonsense')).toBe('nonsense')
  })
})

describe('isValidTimeZone', () => {
  it('checks IANA timezone names', () => {
    expect(isValidTimeZone('Africa/Lagos')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})
