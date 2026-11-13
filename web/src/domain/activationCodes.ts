import { DAY_MS } from './access'
import { ACTIVATION_CODE_ALPHABET, compactActivationCode } from './rules'

/**
 * Activation codes: single-use, tied to one owner email, redeemable for a
 * limited window, and carrying the access length the business will get.
 */

/** How long a code can be used to register. Not how long the business keeps access. */
export const DEFAULT_REDEEM_DAYS = 7
export const MAX_REDEEM_DAYS = 90

/** Wrong registration attempts allowed per hour, per device and per email. */
export const REGISTER_ATTEMPTS_PER_HOUR = 5

export type StoredCodeStatus = 'unused' | 'used' | 'revoked'
export type CodeStatus = StoredCodeStatus | 'expired'

/**
 * A new code like TB-7K4M-X9QD, from cryptographically random bytes.
 * The alphabet has exactly 32 characters and 256 is a multiple of 32, so
 * `byte % 32` picks every character with equal chance.
 */
export function newActivationCode(
  randomBytes: (count: number) => Uint8Array = (count) =>
    crypto.getRandomValues(new Uint8Array(count)),
): string {
  const bytes = randomBytes(8)
  let chars = ''
  for (const byte of bytes) chars += ACTIVATION_CODE_ALPHABET[byte % 32]
  return `TB-${chars.slice(0, 4)}-${chars.slice(4, 8)}`
}

/** Only this hash is stored. Codes are compared in compact form, so typing style doesn't matter. */
export async function hashActivationCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(compactActivationCode(code))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface CodeFacts {
  status: StoredCodeStatus
  ownerEmail: string
  /** ISO timestamp after which the code can no longer be redeemed. */
  redeemBy: string
}

export function codeStatus(code: CodeFacts, now: Date): CodeStatus {
  if (code.status === 'unused' && new Date(code.redeemBy).getTime() <= now.getTime()) {
    return 'expired'
  }
  return code.status
}

export type CodeProblem =
  | 'activation_code_invalid'
  | 'activation_code_used'
  | 'activation_code_revoked'
  | 'activation_code_expired'

/**
 * What is wrong with using this code with this email, or null if it can be used.
 * A code that does not exist and a code made for a different email give the
 * same answer, so nobody can use registration to discover which codes exist.
 */
export function codeProblem(
  code: CodeFacts | undefined,
  email: string,
  now: Date,
): CodeProblem | null {
  if (!code || code.ownerEmail !== email.trim().toLowerCase()) return 'activation_code_invalid'
  const status = codeStatus(code, now)
  if (status === 'used') return 'activation_code_used'
  if (status === 'revoked') return 'activation_code_revoked'
  if (status === 'expired') return 'activation_code_expired'
  return null
}

export function redeemByFromDays(redeemDays: number, now: Date): string {
  return new Date(now.getTime() + redeemDays * DAY_MS).toISOString()
}

export function isValidRedeemDays(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= MAX_REDEEM_DAYS
}
