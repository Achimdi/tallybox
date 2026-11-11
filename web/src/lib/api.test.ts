import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callFunction, callRpc } from './api'
import { AppError, fromDatabaseError } from './errors'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const invoke = vi.fn()
const rpc = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  rpc.mockReset()
  vi.mocked(getSupabase).mockReturnValue({ functions: { invoke }, rpc } as never)
})

/** What supabase-js gives back when an Edge Function answers with an error status. */
function functionRefused(status: number, body: unknown) {
  return {
    data: null,
    error: { name: 'FunctionsHttpError', context: Response.json(body, { status }) },
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return (error as AppError).code
  }
  throw new Error('Expected the call to fail')
}

const schema = z.object({ available: z.boolean() })

describe('callFunction', () => {
  it('returns the checked data and sends a device id', async () => {
    invoke.mockResolvedValue({ data: { data: { available: true } }, error: null })
    await expect(
      callFunction('check-business-code', { businessCode: 'x' }, schema),
    ).resolves.toEqual({ available: true })
    const [name, options] = invoke.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(name).toBe('check-business-code')
    expect(options.headers['x-device-id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("turns the function's error code into an AppError", async () => {
    invoke.mockResolvedValue(functionRefused(409, { error: { code: 'business_code_taken' } }))
    expect(await codeOf(callFunction('register-business', {}, schema))).toBe('business_code_taken')
  })

  it('falls back to the HTTP status for a code it does not know', async () => {
    invoke.mockResolvedValue(functionRefused(429, { error: { code: 'brand_new_code' } }))
    expect(await codeOf(callFunction('x', {}, schema))).toBe('rate_limited')

    invoke.mockResolvedValue(functionRefused(500, 'not json at all'))
    expect(await codeOf(callFunction('x', {}, schema))).toBe('server')
  })

  it('reports a request that never arrived', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', context: new TypeError('Failed to fetch') },
    })
    expect(await codeOf(callFunction('x', {}, schema))).toBe('offline')
  })

  it('refuses a response with the wrong shape', async () => {
    invoke.mockResolvedValue({ data: { data: { available: 'yes' } }, error: null })
    expect(await codeOf(callFunction('x', {}, schema))).toBe('server')
  })
})

describe('callRpc', () => {
  it('returns the checked data', async () => {
    rpc.mockResolvedValue({ data: { kind: 'none', user_id: 'u' }, error: null })
    const result = await callRpc('get_session_state', {}, z.object({ kind: z.string() }))
    expect(result).toEqual({ kind: 'none' })
  })

  it('turns a refusal from our database functions into its code', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'not_found' } })
    expect(await codeOf(callRpc('admin_platform_counts', {}, z.unknown()))).toBe('not_found')
  })
})

describe('fromDatabaseError', () => {
  it('maps the errors the database can give', () => {
    expect(fromDatabaseError({ code: 'P0001', message: 'username_taken' }).code).toBe(
      'username_taken',
    )
    expect(fromDatabaseError({ code: '42501', message: 'permission denied' }).code).toBe(
      'permission_denied',
    )
    expect(fromDatabaseError({ code: 'PGRST301', message: 'JWT expired' }).code).toBe(
      'unauthenticated',
    )
  })

  it('never passes raw database text through as a code', () => {
    expect(fromDatabaseError({ code: 'P0001', message: 'something we never defined' }).code).toBe(
      'server',
    )
    expect(fromDatabaseError({ code: '23505', message: 'duplicate key value' }).code).toBe('server')
  })
})
