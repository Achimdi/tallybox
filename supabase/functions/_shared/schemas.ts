// zod building blocks for request bodies, built on the shared rules.

import { z } from './deps.ts'
import {
  compactActivationCode,
  isValidBusinessCode,
  isValidUsername,
  isWellFormedActivationCode,
  LIMITS,
  normalizeBusinessCode,
  normalizeUsername,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from './rules.ts'

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.emailMax)
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)

export const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX)

export const businessCode = z.string().transform(normalizeBusinessCode).refine(isValidBusinessCode)

export const username = z.string().transform(normalizeUsername).refine(isValidUsername)

export const activationCode = z
  .string()
  .max(40)
  .refine(isWellFormedActivationCode)
  .transform(compactActivationCode)

export const displayName = z.string().trim().min(1).max(LIMITS.displayNameMax)

export const businessName = z
  .string()
  .trim()
  .min(LIMITS.businessNameMin)
  .max(LIMITS.businessNameMax)

/** Optional text: blank becomes null. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null))
}

export const turnstileToken = z.string().min(1).max(2048)

export const uuid = z.uuid()
