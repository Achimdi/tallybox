/**
 * Who may use Tallybox right now: the single access rule.
 *
 * Every access decision goes through `businessAccessState` (the browser-side
 * twin of the database's `business_has_access()`). Nothing else may
 * look at `status` or the end date directly. Later, payment status can be added
 * here without touching any screen.
 */

export const DAY_MS = 24 * 60 * 60 * 1000

/** After the access end date, the business keeps working this many more days. (TO CONFIRM) */
export const ACCESS_GRACE_DAYS = 3

/** The owner sees a banner when access ends within this many days. */
export const ACCESS_WARNING_DAYS = 7

/** Presets offered when generating a code or extending access. */
export const ACCESS_PRESET_DAYS: readonly number[] = [30, 90, 180, 365]

export const DEFAULT_ACCESS_DAYS = 30

export const MAX_ACCESS_DAYS = 3650

export type BusinessStatus = 'active' | 'suspended'

export interface AccessFacts {
  status: BusinessStatus
  /** ISO timestamp when the granted access period ends. Null means open-ended. */
  accessEndsAt: string | null
}

/**
 * - ok:        may use the app
 * - suspended: the super-admin suspended it (manual)
 * - ended:     its access period, plus the grace period, has run out (automatic)
 */
export type AccessState = 'ok' | 'suspended' | 'ended'

export function businessAccessState(business: AccessFacts, now: Date): AccessState {
  if (business.status === 'suspended') return 'suspended'
  if (business.accessEndsAt !== null) {
    const lockAt = new Date(business.accessEndsAt).getTime() + ACCESS_GRACE_DAYS * DAY_MS
    if (now.getTime() >= lockAt) return 'ended'
  }
  return 'ok'
}

export function businessHasAccess(business: AccessFacts, now: Date): boolean {
  return businessAccessState(business, now) === 'ok'
}

/** Whole days until access ends (0 on the last day, negative once past). Null if open-ended. */
export function daysUntilAccessEnds(accessEndsAt: string | null, now: Date): number | null {
  if (accessEndsAt === null) return null
  return Math.ceil((new Date(accessEndsAt).getTime() - now.getTime()) / DAY_MS)
}

/** For the owner banner: access ends within the warning window (or is in its grace period). */
export function accessEndsSoon(accessEndsAt: string | null, now: Date): boolean {
  const days = daysUntilAccessEnds(accessEndsAt, now)
  return days !== null && days <= ACCESS_WARNING_DAYS
}

/** For the developer's filters. */
export type AccessFilter = 'ok' | 'ending_soon' | 'ended'

export function accessFilterFor(business: AccessFacts, now: Date): AccessFilter {
  if (businessAccessState({ ...business, status: 'active' }, now) === 'ended') return 'ended'
  return accessEndsSoon(business.accessEndsAt, now) ? 'ending_soon' : 'ok'
}

/** When a newly registered business's access ends. Null access days means open-ended. */
export function accessEndFromCode(accessDays: number | null, now: Date): string | null {
  if (accessDays === null) return null
  return new Date(now.getTime() + accessDays * DAY_MS).toISOString()
}

/**
 * Extending access adds days from the later of now and the current end date,
 * so extending early never loses days and extending after it ended starts from today.
 * Null days means "make it open-ended".
 */
export function extendAccessEnd(
  currentEnd: string | null,
  days: number | null,
  now: Date,
): string | null {
  if (days === null) return null
  const from = Math.max(now.getTime(), currentEnd ? new Date(currentEnd).getTime() : 0)
  return new Date(from + days * DAY_MS).toISOString()
}

export function isValidAccessDays(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= MAX_ACCESS_DAYS
}
