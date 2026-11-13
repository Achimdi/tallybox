import { addDays, formatDateKey, monthStart, weekStart } from './dates'

/** The quick date ranges offered on Orders and Reports. Weeks start on Monday. */
export type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export const PRESETS: readonly { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
]

/** The business days a preset covers, given today's date key. Null for "Custom". */
export function rangeFor(preset: Preset, today: string): { from: string; to: string } | null {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday':
      return { from: addDays(today, -1), to: addDays(today, -1) }
    case 'week':
      return { from: weekStart(today), to: today }
    case 'month':
      return { from: monthStart(today), to: today }
    case 'custom':
      return null
  }
}

/** "Fri, 13 Nov 2026" or "Mon, 9 Nov 2026 to Fri, 13 Nov 2026". */
export function rangeLabel(from: string, to: string): string {
  return from === to ? formatDateKey(from) : `${formatDateKey(from)} to ${formatDateKey(to)}`
}
