import { ACCESS_PRESET_DAYS, daysUntilAccessEnds } from '@/domain/access'
import type { ChipStatus } from '@/components/StatusChip'
import type { AdminBusiness } from '@/api/types'
import { formatDate } from '@/lib/dates'

/** The developer sees dates in their own timezone. */
export const MY_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export function formatDay(iso: string): string {
  return formatDate(new Date(iso), MY_TIMEZONE)
}

/** "30 days", "1 year", "Open-ended". */
export function accessLengthLabel(days: number | null): string {
  if (days === null) return 'Open-ended'
  if (days === 365) return '1 year'
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** The chip for a business's access period. */
export function accessChip(business: Pick<AdminBusiness, 'accessFilter' | 'accessEndsAt'>): {
  status: ChipStatus
  label: string
} {
  if (business.accessEndsAt === null) return { status: 'open_ended', label: 'Open-ended' }
  if (business.accessFilter === 'ended') return { status: 'access_ended', label: 'Access ended' }
  if (business.accessFilter === 'ending_soon') {
    const days = daysUntilAccessEnds(business.accessEndsAt, new Date()) ?? 0
    return {
      status: 'ending_soon',
      label: days > 0 ? `Ends in ${days} ${days === 1 ? 'day' : 'days'}` : 'In grace period',
    }
  }
  return { status: 'active', label: `Until ${formatDay(business.accessEndsAt)}` }
}

/** The choice in an access-length picker. */
export type AccessChoice = `${number}` | 'custom' | 'open'

export const ACCESS_CHOICES: readonly { value: AccessChoice; label: string }[] = [
  ...ACCESS_PRESET_DAYS.map((days) => ({
    value: `${days}` as AccessChoice,
    label: accessLengthLabel(days),
  })),
  { value: 'custom', label: 'Custom' },
  { value: 'open', label: 'Open-ended' },
]

/** Days for the choice, null for open-ended, or undefined if the custom number is not valid. */
export function resolveAccessChoice(
  choice: AccessChoice,
  customDays: string,
): number | null | undefined {
  if (choice === 'open') return null
  const text = choice === 'custom' ? customDays.trim() : choice
  if (!/^\d+$/.test(text)) return undefined
  const days = Number(text)
  return days >= 1 && days <= 3650 ? days : undefined
}
