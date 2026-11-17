/**
 * Errors and CORS for Edge Functions.
 *
 * Every failure leaves a function as `{ "error": { "code": "..." } }` with a
 * matching HTTP status. The web app turns the code into a friendly message.
 * Raw error text never leaves the server.
 */

const STATUS = {
  validation: 400,
  captcha_failed: 400,
  weak_password: 400,
  activation_code_invalid: 400,
  activation_code_used: 400,
  activation_code_revoked: 400,
  activation_code_expired: 400,
  business_code_invalid: 400,
  username_invalid: 400,
  unauthenticated: 401,
  permission_denied: 403,
  account_disabled: 403,
  business_suspended: 403,
  access_ended: 403,
  origin_not_allowed: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  business_code_taken: 409,
  username_taken: 409,
  email_taken: 409,
  payload_too_large: 413,
  rate_limited: 429,
  server: 500,
  config_missing: 500,
} as const

export type ErrorCode = keyof typeof STATUS

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(STATUS, value)
}

export class HttpError extends Error {
  readonly code: ErrorCode
  readonly status: number
  /** Names of the fields that failed validation. Never their values. */
  readonly fields: readonly string[] | undefined

  constructor(code: ErrorCode, fields?: readonly string[]) {
    super(code)
    this.name = 'HttpError'
    this.code = code
    this.status = STATUS[code]
    this.fields = fields
  }
}

/**
 * Turns a database error into an HttpError.
 * Our SQL functions stop with errcode P0001 and a short code as the message
 * (see private.fail in the migrations). Anything else is an unexpected fault.
 */
export function fromDatabaseError(error: { code?: string; message?: string }): HttpError {
  if (error.code === 'P0001' && isErrorCode(error.message)) {
    return new HttpError(error.message)
  }
  return new HttpError('server')
}

// ---------------------------------------------------------------------------
// CORS: only the app's own addresses may call these functions from a browser.
// ---------------------------------------------------------------------------

/** Used when APP_ORIGINS is not set: local development only. */
export const DEFAULT_APP_ORIGINS: readonly string[] = [
  'http://localhost:5173',
  'http://localhost:4173',
]

/**
 * APP_ORIGINS is a comma-separated list, for example:
 *   https://tallybox.pages.dev,https://*.tallybox.pages.dev
 * A `*` stands for exactly one subdomain label (Cloudflare preview deploys).
 */
export function parseAppOrigins(value: string | undefined): readonly string[] {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return origins.length > 0 ? origins : DEFAULT_APP_ORIGINS
}

export function isOriginAllowed(origin: string, allowed: readonly string[]): boolean {
  return allowed.some((pattern) => {
    if (!pattern.includes('*')) return pattern === origin
    const [prefix = '', suffix = ''] = pattern.split('*')
    if (!origin.startsWith(prefix) || !origin.endsWith(suffix)) return false
    const label = origin.slice(prefix.length, origin.length - suffix.length)
    return /^[a-z0-9-]+$/i.test(label)
  })
}

export function corsHeaders(origin: string | null, allowed: readonly string[]): Headers {
  const headers = new Headers({ Vary: 'Origin' })
  if (origin && isOriginAllowed(origin, allowed)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set(
      'Access-Control-Allow-Headers',
      'authorization, apikey, content-type, x-client-info, x-device-id',
    )
    headers.set('Access-Control-Max-Age', '86400')
  }
  return headers
}

export function jsonResponse(body: unknown, status: number, headers: Headers): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json')
  responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}
