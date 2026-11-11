/**
 * Typed errors.
 *
 * Rule: raw error text (from Supabase, fetch, or anything else) is never shown
 * to a user. Everything is turned into an AppError with a known `code`, and the
 * screen shows the friendly message for that code.
 */

export type AppErrorCode =
  | 'offline'
  | 'unauthenticated'
  | 'permission_denied'
  | 'account_disabled'
  | 'business_suspended'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'insufficient_stock'
  | 'config_missing'
  | 'server'
  | 'unknown'

export interface AppErrorOptions {
  cause?: unknown
  /** Safe, non-personal details for the UI, for example which items are short. */
  details?: Readonly<Record<string, unknown>>
}

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly details: Readonly<Record<string, unknown>> | undefined

  constructor(code: AppErrorCode, options: AppErrorOptions = {}) {
    super(code, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.details = options.details
  }
}

export interface UserMessage {
  /** What happened. */
  title: string
  /** What to do next. */
  description: string
}

const USER_MESSAGES: Record<AppErrorCode, UserMessage> = {
  offline: {
    title: "You're offline",
    description: 'Check your internet connection, then try again.',
  },
  unauthenticated: {
    title: 'Please sign in again',
    description: 'Your session has ended. Sign in to continue.',
  },
  permission_denied: {
    title: "You don't have access to this",
    description: 'Ask the business owner if you think you should.',
  },
  account_disabled: {
    title: 'This account is turned off',
    description: 'Ask the business owner to turn it back on.',
  },
  business_suspended: {
    title: 'This business is suspended',
    description: 'Contact Tallybox support to get it reactivated.',
  },
  not_found: {
    title: "We couldn't find that",
    description: 'It may have been removed. Go back and try again.',
  },
  validation: {
    title: 'Some details need fixing',
    description: 'Check the highlighted fields and try again.',
  },
  conflict: {
    title: 'That changed while you were working',
    description: 'Refresh to see the latest, then try again.',
  },
  rate_limited: {
    title: 'Too many attempts',
    description: 'Wait a few minutes, then try again.',
  },
  insufficient_stock: {
    title: 'Not enough stock',
    description: 'Lower the quantity or remove the item, then try again.',
  },
  config_missing: {
    title: "Tallybox isn't set up yet",
    description: 'The app is missing its connection settings. Contact support.',
  },
  server: {
    title: 'Something went wrong on our side',
    description: 'Nothing was saved. Try again in a moment.',
  },
  unknown: {
    title: 'Something went wrong',
    description: 'Try again. If it keeps happening, contact support.',
  },
}

function codeForHttpStatus(status: number): AppErrorCode {
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'permission_denied'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 422 || status === 400) return 'validation'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server'
  return 'unknown'
}

function isNetworkFailure(error: unknown): boolean {
  // Browsers throw a TypeError when a request cannot reach the network at all.
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message)
}

/** Turns anything that was thrown into an AppError. Never throws. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return new AppError('offline', { cause: error })
  }
  if (isNetworkFailure(error)) return new AppError('offline', { cause: error })

  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = error.status
    if (typeof status === 'number') {
      return new AppError(codeForHttpStatus(status), { cause: error })
    }
  }

  return new AppError('unknown', { cause: error })
}

/** The friendly message to show for any error. */
export function userMessage(error: unknown): UserMessage {
  return USER_MESSAGES[toAppError(error).code]
}
