/**
 * Date helpers.
 *
 * Timestamps are stored in UTC. Each business has its own timezone, and a
 * business "day" is a `date_key` like "2026-11-11" in that timezone.
 *
 * The DATABASE decides an order's date_key. These helpers are only for display
 * and for picking default filters (today, yesterday) in the browser.
 */

const DEFAULT_LOCALE = 'en'
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone })
    return true
  } catch {
    return false
  }
}

/** The calendar day of `date` in `timeZone`, as "YYYY-MM-DD". */
export function dateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isDateKey(value: string): boolean {
  if (!DATE_KEY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** Moves a date key by whole days: addDays("2026-03-01", -1) gives "2026-02-28". */
export function addDays(key: string, days: number): string {
  if (!isDateKey(key)) throw new RangeError('Invalid date key')
  const date = new Date(`${key}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** "11 Nov 2026" */
export function formatDate(date: Date, timeZone: string, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

/** "2:05 PM" */
export function formatTime(date: Date, timeZone: string, locale = DEFAULT_LOCALE): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(
    date,
  )
}

/** "11 Nov 2026, 2:05 PM" */
export function formatDateTime(date: Date, timeZone: string, locale = DEFAULT_LOCALE): string {
  return `${formatDate(date, timeZone, locale)}, ${formatTime(date, timeZone, locale)}`
}

/** A date key as a readable day, for example "Wed, 11 Nov 2026". */
export function formatDateKey(key: string, locale = DEFAULT_LOCALE): string {
  if (!isDateKey(key)) return key
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${key}T00:00:00Z`))
}
