import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import type { z } from 'zod'
import { looksLikeSecretKey } from '@/lib/env'
import type { Database } from '@/lib/database.types'
import {
  AppError,
  fromDatabaseError,
  isAppErrorCode,
  isNetworkFailure,
  toAppError,
} from '@/lib/errors'

/**
 * The Supabase client and the two ways the app talks to the server beyond plain
 * reads:
 *
 *   callFunction  an Edge Function (accounts, super-admin actions)
 *   callRpc       a database function (session state, every change to data)
 *
 * Both check the shape of what comes back with zod and turn every failure into
 * an AppError with a known code. Raw error text goes no further.
 *
 * The client uses the PUBLISHABLE key, which is public by design: what a
 * signed-in person can read is decided by Row Level Security, and every change
 * goes through a server function.
 */

export type TallyboxClient = SupabaseClient<Database>

export interface SupabaseApiOptions {
  url: string
  publishableKey: string
  /** Must match STAFF_EMAIL_DOMAIN in the Edge Functions. */
  staffEmailDomain: string
  /** Where the sign-in is kept. Defaults to this browser's localStorage; tests use memory. */
  storage?: SupportedStorage
  /**
   * A Turnstile token to use when the screen did not supply one. Only for
   * automated tests against a dev project that uses Cloudflare's test keys.
   */
  fallbackCaptchaToken?: string
  /** A random id for this device, sent so the server can limit repeated attempts. */
  deviceId: () => string
  isOnline: () => boolean
}

export function createTallyboxClient(options: SupabaseApiOptions): TallyboxClient {
  if (!options.url || !options.publishableKey) throw new AppError('config_missing')
  // A secret key must never be used in a browser. Refuse to start rather than leak it.
  if (looksLikeSecretKey(options.publishableKey)) {
    throw new AppError('config_missing', { details: { reason: 'secret_key_in_browser' } })
  }
  const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'
  return createClient<Database>(options.url, options.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: inBrowser,
      // Reads the one-time sign-in from an owner's password-reset link.
      detectSessionInUrl: inBrowser,
      ...(options.storage ? { storage: options.storage } : {}),
    },
  })
}

/** In-memory session storage: one per "browser" in tests. */
export function memorySessionStorage(): SupportedStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

async function codeFromResponse(response: unknown): Promise<unknown> {
  if (!(response instanceof Response)) return undefined
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } }
    return body.error?.code
  } catch {
    return undefined
  }
}

export async function callFunction<Schema extends z.ZodType>(
  client: TallyboxClient,
  options: Pick<SupabaseApiOptions, 'deviceId' | 'isOnline'>,
  name: string,
  body: Record<string, unknown>,
  schema: Schema,
): Promise<z.infer<Schema>> {
  if (!options.isOnline()) throw new AppError('offline')
  let data: unknown
  let error: unknown
  try {
    const result = await client.functions.invoke<{ data?: unknown }>(name, {
      body,
      headers: { 'x-device-id': options.deviceId() },
    })
    data = result.data?.data
    error = result.error
  } catch (thrown) {
    throw toAppError(thrown)
  }

  if (error) {
    // supabase-js puts the function's HTTP response on `context`.
    const context = (error as { context?: unknown }).context
    const code = await codeFromResponse(context)
    if (isAppErrorCode(code)) throw new AppError(code, { cause: error })
    if (context instanceof Response) throw toAppError({ status: context.status })
    // No response at all: the request never reached the function.
    throw new AppError(isNetworkFailure(context) || !options.isOnline() ? 'offline' : 'server', {
      cause: error,
    })
  }

  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError('server', { cause: parsed.error })
  return parsed.data
}

type RpcName = keyof Database['public']['Functions']
type RpcArgs<Name extends RpcName> = Database['public']['Functions'][Name]['Args']

export async function callRpc<Name extends RpcName, Schema extends z.ZodType>(
  client: TallyboxClient,
  options: Pick<SupabaseApiOptions, 'isOnline'>,
  name: Name,
  args: RpcArgs<Name>,
  schema: Schema,
): Promise<z.infer<Schema>> {
  if (!options.isOnline()) throw new AppError('offline')
  let data: unknown
  let error: { code?: string; message?: string } | null
  try {
    // The cast keeps this helper generic; `args` is checked by RpcArgs above.
    const result = await client.rpc(name, args as never)
    data = result.data
    error = result.error
  } catch (thrown) {
    throw toAppError(thrown)
  }
  if (error) throw fromDatabaseError(error)

  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError('server', { cause: parsed.error })
  return parsed.data
}

/** Turns a failed table read into an AppError. */
export function fromReadError(error: { code?: string; message?: string }): AppError {
  return fromDatabaseError(error)
}

export type Role = 'owner' | 'staff' | 'super_admin'

/**
 * Who this browser's sign-in says it is, read locally (no network). The
 * database's own rules are the real check; this only lets the app return the
 * same error codes as the demo: "unauthenticated" when nobody is signed in,
 * "permission_denied" for the wrong role.
 */
export async function requireSignedInRole(
  client: TallyboxClient,
  roles: readonly Role[],
): Promise<void> {
  const { data } = await client.auth.getSession()
  if (!data.session) throw new AppError('unauthenticated')
  const role = (data.session.user.app_metadata as { role?: unknown } | undefined)?.role
  if (typeof role !== 'string' || !roles.includes(role as Role)) {
    throw new AppError('permission_denied')
  }
}

export { isAppErrorCode }
