/**
 * Typed errors.
 *
 * Rule: raw error text (from Supabase, fetch, or anything else) is never shown
 * to a user. Everything is turned into an AppError with a known `code`, and the
 * screen shows the friendly message for that code.
 *
 * Edge Functions and database functions report failures with these same codes.
 */

const USER_MESSAGES = {
  offline: {
    title: "You're offline",
    description: 'Check your internet connection, then try again.',
  },
  unauthenticated: {
    title: 'Please sign in again',
    description: 'Your session has ended. Sign in to continue.',
  },
  invalid_credentials: {
    title: "Those details don't match",
    description: 'Check your email and password, then try again.',
  },
  wrong_portal: {
    title: 'This is a staff account',
    description: 'Staff sign in on the staff login page, with a business code and username.',
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
    description: 'Check the fields and try again.',
  },
  conflict: {
    title: 'That changed while you were working',
    description: 'Refresh to see the latest, then try again.',
  },
  rate_limited: {
    title: 'Too many attempts',
    description: 'Wait a few minutes, then try again.',
  },
  captcha_failed: {
    title: "We couldn't confirm you're a person",
    description: 'Complete the check above the button, then try again.',
  },
  weak_password: {
    title: 'That password is too easy to guess',
    description: 'Use at least 8 characters, and avoid common words.',
  },
  activation_code_invalid: {
    title: "That activation code doesn't match",
    description: 'Check the code and use the same email it was sent for.',
  },
  activation_code_used: {
    title: 'That activation code was already used',
    description: 'Each code works once. Ask Tallybox support for a new one.',
  },
  activation_code_revoked: {
    title: 'That activation code was cancelled',
    description: 'Ask Tallybox support for a new one.',
  },
  activation_code_expired: {
    title: 'That activation code has expired',
    description: 'Ask Tallybox support for a new one.',
  },
  business_code_taken: {
    title: 'That business code is taken',
    description: 'Choose a different business code.',
  },
  business_code_invalid: {
    title: "That business code isn't allowed",
    description: 'Use 3 to 20 lowercase letters, digits or hyphens.',
  },
  username_taken: {
    title: 'That username is taken',
    description: 'Choose a different username for this staff member.',
  },
  username_invalid: {
    title: "That username isn't allowed",
    description: 'Use 3 to 20 lowercase letters or digits.',
  },
  email_taken: {
    title: 'That email already has an account',
    description: 'Sign in instead, or use a different email.',
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
} as const satisfies Record<string, UserMessage>

export type AppErrorCode = keyof typeof USER_MESSAGES

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && Object.hasOwn(USER_MESSAGES, value)
}

export interface AppErrorOptions {
  cause?: unknown
  /** Safe, non-personal details for the UI, for example which fields failed. */
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

export function isNetworkFailure(error: unknown): boolean {
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

/**
 * A failure reported by one of our database functions.
 * They stop with errcode P0001 and a short code as the message (private.fail).
 */
export function fromDatabaseError(error: { code?: string; message?: string }): AppError {
  if (error.code === 'P0001' && isAppErrorCode(error.message)) {
    return new AppError(error.message, { cause: error })
  }
  // 42501: the database refused. PGRST301/PGRST303: the token is missing or expired.
  if (error.code === '42501') return new AppError('permission_denied', { cause: error })
  if (error.code === 'PGRST301' || error.code === 'PGRST303') {
    return new AppError('unauthenticated', { cause: error })
  }
  if (isNetworkFailure(error) || /fetch/i.test(error.message ?? '')) {
    return new AppError('offline', { cause: error })
  }
  return new AppError('server', { cause: error })
}

/** The friendly message to show for any error. */
export function userMessage(error: unknown): UserMessage {
  return USER_MESSAGES[toAppError(error).code]
}
