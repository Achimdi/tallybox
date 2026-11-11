import type { z } from 'zod'
import type { Database } from './database.types'
import { deviceId } from './device'
import { AppError, fromDatabaseError, isAppErrorCode, isNetworkFailure, toAppError } from './errors'
import { getSupabase } from './supabase'

/**
 * The two ways the app talks to the server for anything beyond plain reads:
 *
 *   callFunction  an Edge Function (creates accounts, super-admin actions)
 *   callRpc       a database function (reads that need a check, and later
 *                 every order and stock change)
 *
 * Both check the shape of what comes back with zod, and both turn every
 * failure into an AppError with a known code. Raw error text goes no further.
 */

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
  name: string,
  body: Record<string, unknown>,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const supabase = getSupabase()
  let data: unknown
  let error: unknown

  try {
    const result = await supabase.functions.invoke<{ data?: unknown }>(name, {
      body,
      headers: { 'x-device-id': deviceId() },
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
    throw new AppError(isNetworkFailure(context) || !navigator.onLine ? 'offline' : 'server', {
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
  name: Name,
  args: RpcArgs<Name>,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const supabase = getSupabase()
  let data: unknown
  let error: { code?: string; message?: string } | null

  try {
    // The cast keeps this helper generic. `args` is checked by RpcArgs above.
    const result = await supabase.rpc(name, args as never)
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
