import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError, toAppError, userMessage } from './errors'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toAppError', () => {
  it('passes an AppError through unchanged', () => {
    const error = new AppError('insufficient_stock', { details: { itemId: 'a' } })
    expect(toAppError(error)).toBe(error)
  })

  it('maps HTTP statuses to codes', () => {
    expect(toAppError({ status: 401 }).code).toBe('unauthenticated')
    expect(toAppError({ status: 403 }).code).toBe('permission_denied')
    expect(toAppError({ status: 404 }).code).toBe('not_found')
    expect(toAppError({ status: 409 }).code).toBe('conflict')
    expect(toAppError({ status: 429 }).code).toBe('rate_limited')
    expect(toAppError({ status: 503 }).code).toBe('server')
  })

  it('treats a failed network request as offline', () => {
    expect(toAppError(new TypeError('Failed to fetch')).code).toBe('offline')
  })

  it('reports offline when the browser has no connection', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(toAppError(new Error('anything')).code).toBe('offline')
  })

  it('falls back to unknown and keeps the cause for logging', () => {
    const cause = new Error('db exploded: user ada@example.com')
    const error = toAppError(cause)
    expect(error.code).toBe('unknown')
    expect(error.cause).toBe(cause)
  })

  it('never throws, whatever it is given', () => {
    for (const value of [null, undefined, 'text', 42, {}, []]) {
      expect(toAppError(value).code).toBe('unknown')
    }
  })
})

describe('userMessage', () => {
  it('never shows raw error text', () => {
    const message = userMessage(new Error('duplicate key value violates unique constraint'))
    expect(message.title).toBe('Something went wrong')
    expect(`${message.title} ${message.description}`).not.toContain('duplicate key')
  })

  it('says what happened and what to do next', () => {
    const message = userMessage(new AppError('rate_limited'))
    expect(message.title).toBe('Too many attempts')
    expect(message.description).toBe('Wait a few minutes, then try again.')
  })
})
