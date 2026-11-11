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
  VITE_SUPABASE_URL: optionalText.pipe(z.url({ protocol: /^https?$/ }).optional()),
  VITE_SUPABASE_PUBLISHABLE_KEY: optionalText,
  VITE_TURNSTILE_SITE_KEY: optionalText,
})

export interface AppEnv {
  supabaseUrl: string | undefined
  supabasePublishableKey: string | undefined
  turnstileSiteKey: string | undefined
}

export function parseEnv(raw: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    return {
      supabaseUrl: undefined,
      supabasePublishableKey: undefined,
      turnstileSiteKey: undefined,
    }
  }
  return {
    supabaseUrl: result.data.VITE_SUPABASE_URL,
    supabasePublishableKey: result.data.VITE_SUPABASE_PUBLISHABLE_KEY,
    turnstileSiteKey: result.data.VITE_TURNSTILE_SITE_KEY,
  }
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

export const isSupabaseConfigured: boolean =
  Boolean(env.supabaseUrl) &&
  Boolean(env.supabasePublishableKey) &&
  !looksLikeSecretKey(env.supabasePublishableKey ?? '')
