/**
 * Money helpers.
 *
 * Money is always a whole number of MINOR units (kobo, cents, pesewas), exactly
 * as stored in Postgres `bigint` columns. It is never a decimal number, so
 * there are no floating-point surprises like 0.1 + 0.2.
 *
 * Example: NGN 1,250.50 is stored and passed around as 125050.
 */

const DEFAULT_LOCALE = 'en'
const digitsCache = new Map<string, number>()
const formatterCache = new Map<string, Intl.NumberFormat>()

/** How many decimal places a currency uses: NGN and USD 2, JPY 0, KWD 3. */
export function minorUnitDigits(currency: string): number {
  const cached = digitsCache.get(currency)
  if (cached !== undefined) return cached
  const digits =
    new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  digitsCache.set(currency, digits)
  return digits
}

function formatterFor(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`
  let formatter = formatterCache.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
    formatterCache.set(key, formatter)
  }
  return formatter
}

/** Formats minor units for display, for example 125050 + 'NGN' gives "₦1,250.50". */
export function formatMoney(minor: number, currency: string, locale = DEFAULT_LOCALE): string {
  const digits = minorUnitDigits(currency)
  return formatterFor(currency, locale).format(minor / 10 ** digits)
}

/**
 * Turns what a person typed ("1,250.50") into minor units (125050).
 * Returns null when the text is not a valid, non-negative amount for the currency.
 * Uses only whole-number maths.
 */
export function parseMoney(input: string, currency: string): number | null {
  const digits = minorUnitDigits(currency)
  const cleaned = input.replace(/[\s,]/g, '')
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned)
  if (!match) return null

  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > digits) return null

  const minor = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0') || '0')
  return Number.isSafeInteger(minor) ? minor : null
}

/** Minor units as plain text for an input field, for example 125050 gives "1250.50". */
export function minorToInputValue(minor: number, currency: string): string {
  const digits = minorUnitDigits(currency)
  if (digits === 0) return String(minor)
  const text = String(Math.abs(minor)).padStart(digits + 1, '0')
  const sign = minor < 0 ? '-' : ''
  return `${sign}${text.slice(0, -digits)}.${text.slice(-digits)}`
}

/** Unit price times quantity, in minor units. The server always recalculates this. */
export function lineTotal(unitPrice: number, qty: number): number {
  return unitPrice * qty
}

/** Adds up minor-unit amounts. */
export function sumMinor(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/** Short amounts for chart axes: ₦0, ₦500, ₦12K, ₦1.2M. */
export function formatMoneyCompact(
  minor: number,
  currency: string,
  locale = DEFAULT_LOCALE,
): string {
  const digits = minorUnitDigits(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 10 ** digits)
}
