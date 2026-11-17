/**
 * The frame every Edge Function runs in.
 *
 * `defineFunction` takes care of the parts that must never be forgotten:
 * allowed origins, POST only, body size, who is calling, input validation with
 * zod, rate limits, and turning any failure into a safe `{ error: { code } }`.
 * Each function then only describes its own steps.
 *
 * Everything a function needs from the outside world arrives through `Deps`,
 * so tests can run the real logic against stand-ins with no network.
 */

import { createAdminClient, verifyAuth, type z } from './deps.ts'
import {
  corsHeaders,
  fromDatabaseError,
  HttpError,
  isOriginAllowed,
  jsonResponse,
  parseAppOrigins,
} from './http.ts'

/** The slice of the Supabase admin (secret-key) client that functions use. */
export interface AdminClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  createUser(attributes: {
    email: string
    password: string
    app_metadata: Record<string, unknown>
  }): Promise<{ userId: string | null; errorCode: string | null }>
  deleteUser(userId: string): Promise<{ ok: boolean }>
  /**
   * A one-time link that lets the user choose a new password. No email is sent:
   * the super-admin passes the link on by hand (v1 depends on no email).
   */
  generateRecoveryLink(
    email: string,
    redirectTo: string,
  ): Promise<{ link: string | null; errorCode: string | null }>
  /** Sets a user's password, as the owner does for a staff member who forgot theirs. */
  updateUserPassword(userId: string, password: string): Promise<{ errorCode: string | null }>
  /** Stores a file in a Storage bucket. Never overwrites: every file gets a new name. */
  uploadObject(
    bucket: string,
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<{ ok: boolean }>
  /** Removes files from a Storage bucket. Best effort: a leftover file harms nothing. */
  removeObjects(bucket: string, paths: string[]): Promise<{ ok: boolean }>
}

/** Who is calling, taken from their verified token. */
export interface Actor {
  id: string
  appMetadata: Record<string, unknown>
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  event: string
  fn: string
  [field: string]: string | number | boolean | null
}

export interface Deps {
  admin: AdminClient
  /** Returns the caller if their token is valid, otherwise null. */
  verifyUser(request: Request): Promise<Actor | null>
  fetch: typeof fetch
  env(name: string): string | undefined
  log(entry: LogEntry): void
}

export interface Context<Body> {
  body: Body
  /** Set for `auth: 'user'` functions, null for public ones. */
  actor: Actor | null
  admin: AdminClient
  ip: string
  deviceId: string | null
  /** The app's own address: the caller's allowed origin, or the first configured one. */
  appOrigin: string
  deps: Deps
  /** Counts one attempt and stops with `rate_limited` when over the limit. */
  limit(scope: string, who: string, max: number, windowSeconds: number): Promise<void>
  /** Calls a database function and returns its result, or stops with its error code. */
  rpc<Result = unknown>(fn: string, args: Record<string, unknown>): Promise<Result>
}

interface FunctionOptions<Schema extends z.ZodType> {
  name: string
  /** 'user': a signed-in caller is required. 'none': public (protect it with Turnstile and limits). */
  auth: 'user' | 'none'
  schema: Schema
  /** The largest request body accepted. Default 10 KB; a logo needs more. */
  maxBodyBytes?: number
  run(context: Context<z.infer<Schema>>): Promise<unknown>
}

const MAX_BODY_BYTES = 10_000

// --- The real outside world, created on first use ---------------------------

let realAdmin: AdminClient | undefined

function createRealAdmin(): AdminClient {
  const client = createAdminClient()
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
    async createUser(attributes) {
      const { data, error } = await client.auth.admin.createUser({
        ...attributes,
        // v1 sends no email. The activation code (owners) or the owner (staff)
        // is the proof of the right person.
        email_confirm: true,
      })
      if (error) return { userId: null, errorCode: error.code ?? 'unknown' }
      return { userId: data.user?.id ?? null, errorCode: null }
    },
    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId)
      return { ok: !error }
    },
    async generateRecoveryLink(email, redirectTo) {
      const { data, error } = await client.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      if (error) return { link: null, errorCode: error.code ?? 'unknown' }
      return { link: data.properties?.action_link ?? null, errorCode: null }
    },
    async updateUserPassword(userId, password) {
      const { error } = await client.auth.admin.updateUserById(userId, { password })
      return { errorCode: error ? (error.code ?? 'unknown') : null }
    },
    async uploadObject(bucket, path, bytes, contentType) {
      const { error } = await client.storage
        .from(bucket)
        .upload(path, bytes, { contentType, upsert: false, cacheControl: '31536000' })
      return { ok: !error }
    },
    async removeObjects(bucket, paths) {
      const { error } = await client.storage.from(bucket).remove(paths)
      return { ok: !error }
    },
  }
}

const realDeps: Deps = {
  get admin() {
    realAdmin ??= createRealAdmin()
    return realAdmin
  },
  async verifyUser(request) {
    const { data, error } = await verifyAuth(request, { auth: 'user' })
    if (error || !data.userClaims) return null
    return { id: data.userClaims.id, appMetadata: data.userClaims.appMetadata ?? {} }
  },
  fetch: (input, init) => fetch(input, init),
  env: (name) => Deno.env.get(name),
  // Structured, and never contains personal data: only codes and counts.
  log: (entry) => console.log(JSON.stringify({ ...entry, time: new Date().toISOString() })),
}

/** The real outside world, with any stand-ins a test supplies on top. */
function resolveDeps(overrides?: Partial<Deps>): Deps {
  if (!overrides) return realDeps
  return {
    // A getter, so the real admin client is never created when a test supplies its own.
    get admin() {
      return overrides.admin ?? realDeps.admin
    },
    verifyUser: overrides.verifyUser ?? realDeps.verifyUser,
    fetch: overrides.fetch ?? realDeps.fetch,
    env: overrides.env ?? realDeps.env,
    log: overrides.log ?? realDeps.log,
  }
}

// --- Helpers ----------------------------------------------------------------

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The caller's IP as reported by the platform's proxy. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('cf-connecting-ip') || 'unknown'
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (declared > maxBytes) throw new HttpError('payload_too_large')
  const text = await request.text()
  if (text.length > maxBytes) throw new HttpError('payload_too_large')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError('validation')
  }
}

/** Checks a Cloudflare Turnstile token with Cloudflare. Stops with `captcha_failed` if it is not good. */
export async function verifyTurnstile(deps: Deps, token: string, ip: string): Promise<void> {
  const secret = deps.env('TURNSTILE_SECRET_KEY')
  if (!secret) throw new HttpError('config_missing')

  const form = new URLSearchParams({ secret, response: token })
  if (ip !== 'unknown') form.set('remoteip', ip)

  let success = false
  try {
    const response = await deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    })
    const result = (await response.json()) as { success?: unknown }
    success = result.success === true
  } catch {
    // Cloudflare could not be reached. Refuse rather than let a bot through.
    throw new HttpError('server')
  }
  if (!success) throw new HttpError('captcha_failed')
}

// --- The frame --------------------------------------------------------------

export function defineFunction<Schema extends z.ZodType>(
  options: FunctionOptions<Schema>,
): (request: Request, overrides?: Partial<Deps>) => Promise<Response> {
  return async (request, overrides) => {
    const deps = resolveDeps(overrides)
    const allowedOrigins = parseAppOrigins(deps.env('APP_ORIGINS'))
    const origin = request.headers.get('origin')
    const headers = corsHeaders(origin, allowedOrigins)

    const fail = (error: HttpError) =>
      jsonResponse(
        { error: { code: error.code, ...(error.fields ? { fields: error.fields } : {}) } },
        error.status,
        headers,
      )

    try {
      // A browser always sends Origin on these requests. Other callers (tests,
      // scripts) do not, and are not affected by CORS anyway.
      if (origin && !isOriginAllowed(origin, allowedOrigins)) {
        throw new HttpError('origin_not_allowed')
      }
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
      if (request.method !== 'POST') throw new HttpError('method_not_allowed')

      const actor = options.auth === 'user' ? await deps.verifyUser(request) : null
      if (options.auth === 'user' && !actor) throw new HttpError('unauthenticated')

      const parsed = options.schema.safeParse(
        await readJson(request, options.maxBodyBytes ?? MAX_BODY_BYTES),
      )
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
        throw new HttpError('validation', fields)
      }

      const context: Context<z.infer<Schema>> = {
        body: parsed.data,
        actor,
        admin: deps.admin,
        ip: clientIp(request),
        deviceId: request.headers.get('x-device-id')?.slice(0, 64) || null,
        // The origin was checked above; without one (tests, scripts) use the first real address.
        appOrigin:
          origin ?? allowedOrigins.find((pattern) => !pattern.includes('*')) ?? allowedOrigins[0]!,
        deps,
        async limit(scope, who, max, windowSeconds) {
          const key = await sha256Hex(`${scope}:${who}`)
          const { data, error } = await deps.admin.rpc('rate_limit_hit', {
            p_key: key,
            p_max: max,
            p_window_seconds: windowSeconds,
          })
          // If the limiter itself fails, refuse: never run unprotected.
          if (error) throw new HttpError('server')
          if (data !== true) throw new HttpError('rate_limited')
        },
        async rpc<Result>(fn: string, args: Record<string, unknown>) {
          const { data, error } = await deps.admin.rpc(fn, args)
          if (error) throw fromDatabaseError(error)
          return data as Result
        },
      }

      const data = await options.run(context)
      deps.log({ level: 'info', event: 'ok', fn: options.name })
      return jsonResponse({ data }, 200, headers)
    } catch (error) {
      if (error instanceof HttpError) {
        deps.log({
          level: error.status >= 500 ? 'error' : 'warn',
          event: 'refused',
          fn: options.name,
          code: error.code,
        })
        return fail(error)
      }
      deps.log({
        level: 'error',
        event: 'crash',
        fn: options.name,
        errorType: error instanceof Error ? error.name : typeof error,
      })
      return fail(new HttpError('server'))
    }
  }
}
