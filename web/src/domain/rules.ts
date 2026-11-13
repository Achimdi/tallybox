/**
 * Naming and format rules: business codes, usernames, passwords, activation
 * codes and text lengths.
 *
 * Plain TypeScript with no imports, so the mock data layer, the screens and
 * (in Phase 2) the Supabase Edge Functions and database can all apply exactly
 * the same rules. If you change a rule here, change it there too.
 */

// ---------------------------------------------------------------------------
// Business code: what staff type to say which business they belong to.
// ---------------------------------------------------------------------------

/** Lowercase letters, digits and hyphens, 3 to 20 characters, no hyphen at either end. */
export const BUSINESS_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,18}[a-z0-9]$/

/** Kept back so nobody can pose as Tallybox or clash with future addresses. */
export const RESERVED_BUSINESS_CODES: readonly string[] = [
  'admin',
  'api',
  'app',
  'www',
  'tallybox',
  'support',
  'help',
  'staff',
  'owner',
  'login',
  'register',
  'billing',
  'system',
  'root',
  'test',
  'demo',
]

export function normalizeBusinessCode(value: string): string {
  return value.trim().toLowerCase()
}

export type BusinessCodeProblem = 'too_short' | 'too_long' | 'characters' | 'hyphens' | 'reserved'

/** Why a (normalized) business code is not allowed, or null if it is fine. */
export function businessCodeProblem(code: string): BusinessCodeProblem | null {
  if (code.length < 3) return 'too_short'
  if (code.length > 20) return 'too_long'
  if (!/^[a-z0-9-]+$/.test(code)) return 'characters'
  if (!BUSINESS_CODE_PATTERN.test(code) || code.includes('--')) return 'hyphens'
  if (RESERVED_BUSINESS_CODES.includes(code)) return 'reserved'
  return null
}

export function isValidBusinessCode(code: string): boolean {
  return businessCodeProblem(code) === null
}

// ---------------------------------------------------------------------------
// Staff usernames
// ---------------------------------------------------------------------------

export const USERNAME_MIN = 3
export const USERNAME_MAX = 20

/** Lowercase letters and digits, optionally joined by single dots, hyphens or underscores. */
export const USERNAME_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(username)
  )
}

/**
 * Staff have no real email. Supabase Auth needs one, so each staff member gets
 * a made-up address that can never receive mail. `.invalid` is reserved for
 * exactly this purpose and can never be registered by anyone.
 *
 * The create-staff function and the staff login page MUST build the address the
 * same way, which is why they both call this.
 */
export const DEFAULT_STAFF_EMAIL_DOMAIN = 'tallybox.invalid'

export function staffEmail(
  username: string,
  businessCode: string,
  domain: string = DEFAULT_STAFF_EMAIL_DOMAIN,
): string {
  return `${normalizeUsername(username)}@${normalizeBusinessCode(businessCode)}.staff.${domain}`
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export const PASSWORD_MIN = 8
/** Supabase Auth hashes with bcrypt, which ignores anything past 72 bytes. */
export const PASSWORD_MAX = 72

// ---------------------------------------------------------------------------
// Activation codes, like TB-7K4M-X9QD
// ---------------------------------------------------------------------------

/** No 0, O, 1 or I, so codes are easy to read aloud and type. */
export const ACTIVATION_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const ACTIVATION_CODE_COMPACT = /^TB[2-9A-HJ-NP-Z]{8}$/

/** Removes spaces and hyphens and upper-cases, so "tb-7k4m x9qd" becomes "TB7K4MX9QD". */
export function compactActivationCode(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

export function isWellFormedActivationCode(value: string): boolean {
  return ACTIVATION_CODE_COMPACT.test(compactActivationCode(value))
}

/** Shows a code the standard way: TB-7K4M-X9QD. */
export function formatActivationCode(value: string): string {
  const compact = compactActivationCode(value)
  if (!ACTIVATION_CODE_COMPACT.test(compact)) return value.trim().toUpperCase()
  return `TB-${compact.slice(2, 6)}-${compact.slice(6, 10)}`
}

// ---------------------------------------------------------------------------
// Text lengths (the database has matching checks)
// ---------------------------------------------------------------------------

export const LIMITS = {
  businessNameMin: 2,
  businessNameMax: 80,
  displayNameMax: 80,
  phoneMax: 30,
  noteMax: 200,
  reasonMax: 500,
  emailMax: 254,
  activationCodeDaysMin: 1,
  activationCodeDaysMax: 90,
} as const
