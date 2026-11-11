import { describe, expect, it, vi } from 'vitest'
import { AppError } from './errors'
import { describeError, logger, redact } from './logger'

describe('redact', () => {
  it('removes anything that looks personal or secret', () => {
    const safe = redact({
      orderId: 'o-1',
      qty: 3,
      customer_name: 'Ada Obi',
      customerPhone: '+2348012345678',
      ownerEmail: 'ada@example.com',
      password: 'hunter2',
      accessToken: 'abc',
      payment_reference: 'TRF-99',
      note: 'deliver to back door',
    })
    expect(safe).toEqual({
      orderId: 'o-1',
      qty: 3,
      customer_name: '[redacted]',
      customerPhone: '[redacted]',
      ownerEmail: '[redacted]',
      password: '[redacted]',
      accessToken: '[redacted]',
      payment_reference: '[redacted]',
      note: '[redacted]',
    })
  })

  it('does not write whole objects', () => {
    expect(redact({ payload: { anything: 'inside' } })).toEqual({ payload: '[object]' })
  })
})

describe('describeError', () => {
  it('logs the type and code, never the message', () => {
    const cause = new TypeError('Failed to fetch https://x.supabase.co?email=ada@example.com')
    expect(describeError(new AppError('offline', { cause }))).toEqual({
      errorType: 'AppError',
      code: 'offline',
      causeType: 'TypeError',
    })
    expect(describeError(new RangeError('secret detail'))).toEqual({ errorType: 'RangeError' })
  })
})

describe('logger', () => {
  it('writes one structured JSON line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    logger.error('order_failed', new AppError('server'), { orderId: 'o-1', customerName: 'Ada' })

    expect(spy).toHaveBeenCalledOnce()
    const entry = JSON.parse(spy.mock.calls[0]?.[0] as string) as Record<string, unknown>
    expect(entry).toMatchObject({
      level: 'error',
      event: 'order_failed',
      orderId: 'o-1',
      customerName: '[redacted]',
      code: 'server',
    })
    expect(JSON.stringify(entry)).not.toContain('Ada')
  })
})
