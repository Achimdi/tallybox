/**
 * CSV files that open cleanly in Excel, Google Sheets and Numbers.
 *
 * Cells that start with = + - @ (or a tab or carriage return) are prefixed with
 * an apostrophe, so a customer name like "=HYPERLINK(...)" can never run as a
 * formula when the owner opens the file (CSV injection).
 */

export type CsvCell = string | number | null

/** The UTF-8 byte-order mark. */
const BOM = String.fromCharCode(0xfeff)

const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: CsvCell): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  // A plain number (like a negative amount) is data, not a formula.
  if (/^-?\d+(\.\d+)?$/.test(value)) return value
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Rows joined with CRLF, as the CSV standard says. Starts with a byte-order mark so Excel reads UTF-8 (₦, é…). */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','))
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** A minor-unit amount as a plain decimal for spreadsheets: 45000 → "450.00". */
export function csvAmount(minor: number, digits: number): string {
  if (digits === 0) return String(minor)
  const sign = minor < 0 ? '-' : ''
  const absolute = Math.abs(minor)
  const whole = Math.floor(absolute / 10 ** digits)
  const fraction = String(absolute % 10 ** digits).padStart(digits, '0')
  return `${sign}${whole}.${fraction}`
}
