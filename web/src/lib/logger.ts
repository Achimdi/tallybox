/**
 * Structured logging with no personal data.
 *
 * Log an event name plus a few safe fields. Anything that looks personal or
 * secret is removed before it is written, and raw error messages are not logged
 * (they can contain emails or names), only the error's type and our own code.
 *
 * There is no third-party error service in v1. This is the single place to add
 * one later.
 */

import { AppError } from './errors'
import { APP_VERSION } from './version'

type LogLevel = 'info' | 'warn' | 'error'
type LogFields = Record<string, unknown>

const SENSITIVE_KEY =
  /pass|secret|token|key|auth|cookie|session|email|phone|name|address|note|customer|reference/i

export function redact(fields: LogFields): LogFields {
  const safe: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) {
      safe[key] = '[redacted]'
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null ||
      value === undefined
    ) {
      safe[key] = value
    } else if (typeof value === 'string') {
      safe[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value
    } else {
      safe[key] = '[object]'
    }
  }
  return safe
}

/** Describes an error without its message. */
export function describeError(error: unknown): LogFields {
  if (error instanceof AppError) {
    const cause: unknown = error.cause
    return {
      errorType: 'AppError',
      code: error.code,
      causeType: cause instanceof Error ? cause.name : typeof cause,
    }
  }
  if (error instanceof Error) return { errorType: error.name }
  return { errorType: typeof error }
}

function write(level: LogLevel, event: string, fields: LogFields = {}): void {
  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    version: APP_VERSION,
    ...redact(fields),
  }
  // The one allowed console call in the app.
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry))
}

export const logger = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, error: unknown, fields: LogFields = {}) =>
    write('error', event, { ...fields, ...describeError(error) }),
}
