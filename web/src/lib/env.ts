import { DEFAULT_STAFF_EMAIL_DOMAIN } from '@/domain/rules'
import { z } from 'zod'

/**
 * Public configuration from environment variables (see /.env.example).
 *
 * Everything here ships to the browser, so nothing here is a secret. The
 * Supabase secret key must never be added to this file.
 */

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))

const envSchema = z.object({
  VITE_DATA_SOURCE: optionalText,
  VITE_RELEASE: optionalText,
  VITE_SUPABASE_URL: optionalText.pipe(z.url({ protocol: /^https?$/ }).optional()),
  VITE_SUPABASE_PUBLISHABLE_KEY: optionalText,
  VITE_TURNSTILE_SITE_KEY: optionalText,
  VITE_STAFF_EMAIL_DOMAIN: optionalText,
})

/** Where data comes from. `mock` (demo data in this browser) unless set. */
export type DataSource = 'mock' | 'supabase'

/** `client` marks a build for real clients, which must never use demo data. */
export type Release = 'demo' | 'client'

export interface AppEnv {
  dataSource: DataSource
  release: Release
  supabaseUrl: string | undefined
  supabasePublishableKey: string | undefined
  turnstileSiteKey: string | undefined
  /** Domain for made-up staff sign-in addresses. */
  staffEmailDomain: string
}

export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(raw)
  const data = result.success ? result.data : undefined
  return {
    dataSource: data?.VITE_DATA_SOURCE === 'supabase' ? 'supabase' : 'mock',
    release: data?.VITE_RELEASE === 'client' ? 'client' : 'demo',
    supabaseUrl: data?.VITE_SUPABASE_URL,
    supabasePublishableKey: data?.VITE_SUPABASE_PUBLISHABLE_KEY,
    turnstileSiteKey: data?.VITE_TURNSTILE_SITE_KEY,
    staffEmailDomain: data?.VITE_STAFF_EMAIL_DOMAIN ?? DEFAULT_STAFF_EMAIL_DOMAIN,
  }
}

/**
 * A build for real clients must not run on demo data: their records would live
 * only in one browser and vanish. Checked when building (vite.config.ts) and
 * again when the app starts (main.tsx).
 */
export function releaseProblem(appEnv: Pick<AppEnv, 'dataSource' | 'release'>): string | null {
  if (appEnv.release === 'client' && appEnv.dataSource === 'mock') {
    return 'A client release cannot use demo data. Set VITE_DATA_SOURCE=supabase.'
  }
  return null
}

/** Guards against the one mistake that must never ship: a secret key in the browser. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  // Legacy keys are JWTs. The payload names the role.
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return json.includes('"service_role"')
  } catch {
    return false
  }
}

export const env: AppEnv = parseEnv(import.meta.env)
