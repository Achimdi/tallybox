import { z } from 'zod'
import { staffEmail } from '@/domain/rules'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type {
  AdminApi,
  AdminActivationCode,
  AdminBusiness,
  AdminBusinessDetail,
  AuthApi,
  RegistrationApi,
  SessionResult,
  StaffApi,
  StaffMember,
} from '../types'
import {
  callFunction,
  callRpc,
  fromReadError,
  type SupabaseApiOptions,
  type TallyboxClient,
} from './client'

/**
 * Sign-in, registration, staff accounts and the developer portal on Supabase
 * (Phase 2A). The same contract tests as the demo prove they behave alike.
 */

// ---------------------------------------------------------------------------
// Session state: the database, not the token, decides who someone is
// ---------------------------------------------------------------------------

const sessionStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('super_admin'), user_id: z.string() }),
  z.object({ kind: z.literal('none'), user_id: z.string() }),
  z.object({
    kind: z.literal('member'),
    user_id: z.string(),
    role: z.enum(['owner', 'staff']),
    display_name: z.string(),
    username: z.string().nullable(),
    active: z.boolean(),
    access: z.enum(['ok', 'suspended', 'ended']),
    business: z.object({
      id: z.string(),
      name: z.string(),
      business_code: z.string(),
      currency_code: z.string(),
      timezone: z.string(),
      access_ends_at: z.string().nullable(),
    }),
  }),
])

export type RawSessionState = z.infer<typeof sessionStateSchema>

/** Decides whether the person may use the app, and as whom. Pure, so it is unit-tested. */
export function interpretSessionState(state: RawSessionState, email: string | null): SessionResult {
  if (state.kind === 'super_admin') {
    return {
      kind: 'user',
      user: {
        id: state.user_id,
        role: 'super_admin',
        displayName: 'Developer',
        email,
        username: null,
        businessId: null,
        businessName: null,
        businessCode: null,
        currencyCode: null,
        timezone: null,
        accessEndsAt: null,
      },
    }
  }
  if (state.kind === 'none') {
    return {
      kind: 'blocked',
      notice: { reason: 'no_profile', businessName: null, accessEndedAt: null },
    }
  }
  // A blocked business is reported before a turned-off account: it is the
  // bigger fact, and it is the same for everyone in the business.
  if (state.access === 'suspended') {
    return {
      kind: 'blocked',
      notice: { reason: 'suspended', businessName: state.business.name, accessEndedAt: null },
    }
  }
  if (state.access === 'ended') {
    return {
      kind: 'blocked',
      notice: {
        reason: 'access_ended',
        businessName: state.business.name,
        accessEndedAt: state.business.access_ends_at,
      },
    }
  }
  if (!state.active) {
    return {
      kind: 'blocked',
      notice: { reason: 'disabled', businessName: state.business.name, accessEndedAt: null },
    }
  }
  return {
    kind: 'user',
    user: {
      id: state.user_id,
      role: state.role,
      displayName: state.display_name,
      // Staff sign in with a made-up address; it is never shown.
      email: state.role === 'staff' ? null : email,
      username: state.username,
      businessId: state.business.id,
      businessName: state.business.name,
      businessCode: state.business.business_code,
      currencyCode: state.business.currency_code,
      timezone: state.business.timezone,
      accessEndsAt: state.business.access_ends_at,
    },
  }
}

/** Supabase Auth error codes with their own message. Anything else reads as "wrong details". */
const AUTH_CODES: Record<string, AppErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  captcha_failed: 'captcha_failed',
  user_banned: 'account_disabled',
  weak_password: 'weak_password',
  same_password: 'weak_password',
}

export function fromAuthError(
  error: { code?: string; status?: number; message?: string },
  isOnline: () => boolean,
): AppError {
  if (error.code && AUTH_CODES[error.code])
    return new AppError(AUTH_CODES[error.code]!, { cause: error })
  if (error.status === 429) return new AppError('rate_limited', { cause: error })
  if (error.status !== undefined && error.status >= 500)
    return new AppError('server', { cause: error })
  if (error.status === undefined || error.status === 0) {
    // No HTTP status: the request never got an answer.
    return new AppError(isOnline() ? 'server' : 'offline', { cause: error })
  }
  // Any other refusal is reported like a wrong password, so sign-in never
  // reveals which accounts exist.
  return new AppError('invalid_credentials', { cause: error })
}

// ---------------------------------------------------------------------------
// The API sections
// ---------------------------------------------------------------------------

const businessRow = z.object({
  id: z.string(),
  name: z.string(),
  business_code: z.string(),
  status: z.enum(['active', 'suspended']),
  access_ends_at: z.string().nullable(),
  access_filter: z.enum(['ok', 'ending_soon', 'ended']),
  created_at: z.string(),
  owner_name: z.string().nullable(),
  owner_email: z.string().nullable(),
  staff_count: z.coerce.number(),
  last_activity_at: z.string().nullable(),
  suspended_at: z.string().nullable(),
  suspended_reason: z.string().nullable(),
})

function toAdminBusiness(row: z.infer<typeof businessRow>): AdminBusiness {
  return {
    id: row.id,
    name: row.name,
    businessCode: row.business_code,
    status: row.status,
    accessEndsAt: row.access_ends_at,
    accessFilter: row.access_filter,
    createdAt: row.created_at,
    ownerName: row.owner_name,
    ownerEmail: row.owner_email,
    staffCount: row.staff_count,
    lastActivityAt: row.last_activity_at,
    suspendedAt: row.suspended_at,
    suspendedReason: row.suspended_reason,
  }
}

const codeRow = z.object({
  id: z.string(),
  owner_email: z.string(),
  note: z.string().nullable(),
  status: z.enum(['unused', 'used', 'revoked', 'expired']),
  created_at: z.string(),
  expires_at: z.string(),
  access_days: z.number().nullable(),
  used_at: z.string().nullable(),
  used_by_business_name: z.string().nullable(),
})

const staffRow = z.object({
  id: z.string(),
  display_name: z.string(),
  username: z.string(),
  active: z.boolean(),
  created_at: z.string(),
  last_login_at: z.string().nullable(),
})

function toStaffMember(row: z.infer<typeof staffRow>): StaffMember {
  return {
    id: row.id,
    displayName: row.display_name,
    username: row.username,
    active: row.active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export function createAccountsApi(client: TallyboxClient, options: SupabaseApiOptions) {
  const rpc = <Name extends Parameters<typeof callRpc>[2], Schema extends z.ZodType>(
    name: Name,
    args: Parameters<typeof callRpc<Name, Schema>>[3],
    schema: Schema,
  ) => callRpc(client, options, name, args, schema)
  const fn = <Schema extends z.ZodType>(
    name: string,
    body: Record<string, unknown>,
    schema: Schema,
  ) => callFunction(client, options, name, body, schema)

  /**
   * Who this browser's sign-in says it is, read locally (no network). The
   * database's own rules are the real check; this only lets the app return the
   * same error codes as the demo: "unauthenticated" when nobody is signed in,
   * "permission_denied" for the wrong role.
   */
  async function requireRole(roles: readonly ('owner' | 'staff' | 'super_admin')[]) {
    const { data } = await client.auth.getSession()
    if (!data.session) throw new AppError('unauthenticated')
    const role = (data.session.user.app_metadata as { role?: unknown } | undefined)?.role
    if (typeof role !== 'string' || !roles.includes(role as 'owner')) {
      throw new AppError('permission_denied')
    }
  }

  /** The developer portal looks like it doesn't exist to anyone else: "not found". */
  async function asDeveloper<Result>(action: () => Promise<Result>): Promise<Result> {
    try {
      await requireRole(['super_admin'])
      return await action()
    } catch (thrown) {
      if (
        thrown instanceof AppError &&
        (thrown.code === 'unauthenticated' || thrown.code === 'permission_denied')
      ) {
        throw new AppError('not_found', { cause: thrown })
      }
      throw thrown
    }
  }

  /** Signs out on this device only. Never throws. */
  async function signOutHere() {
    try {
      await client.auth.signOut({ scope: 'local' })
    } catch {
      // Already signed out, or offline: either way this device holds no session now.
    }
  }

  async function sessionState(recordLogin: boolean): Promise<SessionResult> {
    const state = await rpc(
      'get_session_state',
      { p_record_login: recordLogin },
      sessionStateSchema,
    )
    const { data } = await client.auth.getSession()
    return interpretSessionState(state, data.session?.user.email ?? null)
  }

  const auth: AuthApi = {
    async signIn(input) {
      if (!options.isOnline()) throw new AppError('offline')
      const email =
        input.portal === 'owner'
          ? input.email.trim().toLowerCase()
          : staffEmail(input.username, input.businessCode, options.staffEmailDomain)
      const { error } = await client.auth.signInWithPassword({
        email,
        password: input.password,
        ...(input.captchaToken ? { options: { captchaToken: input.captchaToken } } : {}),
      })
      if (error) throw fromAuthError(error, options.isOnline)

      let result: SessionResult
      try {
        result = await sessionState(true)
      } catch (thrown) {
        await signOutHere()
        throw thrown
      }
      if (result.kind === 'blocked') {
        await signOutHere()
        return result
      }
      // The owner page also signs in the developer. Staff belong on the staff page.
      if (input.portal === 'owner' && result.user.role === 'staff') {
        await signOutHere()
        throw new AppError('wrong_portal')
      }
      return result
    },

    async getSession() {
      const { data } = await client.auth.getSession()
      if (!data.session) return null
      let result: SessionResult
      try {
        result = await sessionState(false)
      } catch (thrown) {
        const error =
          thrown instanceof AppError ? thrown : new AppError('unknown', { cause: thrown })
        // The token was revoked or expired: nobody is signed in any more.
        if (error.code === 'unauthenticated' || error.code === 'permission_denied') {
          await signOutHere()
          return null
        }
        throw error
      }
      if (result.kind === 'blocked') await signOutHere()
      return result
    },

    signOut: signOutHere,

    async changePassword({ currentPassword, newPassword }) {
      const { data } = await client.auth.getSession()
      const email = data.session?.user.email
      if (!email) throw new AppError('unauthenticated')
      // Supabase does not check the current password itself, so sign in with it first.
      const check = await client.auth.signInWithPassword({ email, password: currentPassword })
      if (check.error) {
        const error = fromAuthError(check.error, options.isOnline)
        throw error.code === 'invalid_credentials'
          ? new AppError('wrong_password', { cause: check.error })
          : error
      }
      const { error } = await client.auth.updateUser({ password: newPassword })
      if (error) throw fromAuthError(error, options.isOnline)
    },
  }

  const registration: RegistrationApi = {
    async isBusinessCodeAvailable(businessCode) {
      const result = await fn(
        'check-business-code',
        { businessCode },
        z.object({ available: z.boolean() }),
      )
      return result.available
    },

    async registerBusiness(input) {
      const token = input.captchaToken ?? options.fallbackCaptchaToken
      if (!token) throw new AppError('captcha_failed')
      return fn(
        'register-business',
        {
          businessName: input.businessName,
          businessCode: input.businessCode,
          ownerName: input.ownerName,
          email: input.email,
          password: input.password,
          phone: input.phone,
          activationCode: input.activationCode,
          timezone: input.timezone,
          turnstileToken: token,
        },
        z.object({ businessCode: z.string() }),
      )
    },
  }

  async function readStaff(): Promise<StaffMember[]> {
    await requireRole(['owner'])
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, username, active, created_at, last_login_at')
      .eq('role', 'staff')
      .order('display_name')
    if (error) throw fromReadError(error)
    return z.array(staffRow).parse(data).map(toStaffMember)
  }

  const notYet = (): Promise<never> => Promise.reject(new AppError('config_missing'))

  const staff: StaffApi = {
    list: readStaff,
    async create(input) {
      const created = await fn(
        'create-staff',
        { displayName: input.displayName, username: input.username, password: input.password },
        z.object({ id: z.string(), username: z.string(), displayName: z.string() }),
      )
      const member = (await readStaff()).find((candidate) => candidate.id === created.id)
      if (!member) throw new AppError('server')
      return member
    },
    // Phase 2D.
    resetPassword: notYet,
    setActive: notYet,
  }

  const admin: AdminApi = {
    async listBusinesses() {
      return asDeveloper(async () => {
        const rows = await rpc('admin_list_businesses', undefined as never, z.array(businessRow))
        return rows.map(toAdminBusiness)
      })
    },

    async getBusiness(businessId) {
      return asDeveloper(async () => {
        const row = await rpc(
          'admin_get_business',
          { p_business_id: businessId },
          businessRow.extend({
            active_staff_count: z.coerce.number(),
            order_count: z.coerce.number(),
            order_count_today: z.coerce.number(),
            phone: z.string().nullable(),
            timezone: z.string(),
            currency_code: z.string(),
          }),
        )
        const detail: AdminBusinessDetail = {
          ...toAdminBusiness(row),
          activeStaffCount: row.active_staff_count,
          orderCount: row.order_count,
          orderCountToday: row.order_count_today,
          phone: row.phone,
          timezone: row.timezone,
          currencyCode: row.currency_code,
        }
        return detail
      })
    },

    async platformCounts() {
      return asDeveloper(async () => {
        const counts = await rpc(
          'admin_platform_counts',
          undefined as never,
          z.object({
            businesses: z.number(),
            suspended: z.number(),
            ending_soon: z.number(),
            access_ended: z.number(),
            staff: z.number(),
            unused_codes: z.number(),
          }),
        )
        return {
          businesses: counts.businesses,
          suspended: counts.suspended,
          endingSoon: counts.ending_soon,
          accessEnded: counts.access_ended,
          staff: counts.staff,
          unusedCodes: counts.unused_codes,
        }
      })
    },

    async setBusinessStatus({ businessId, status, reason }) {
      return asDeveloper(async () => {
        await fn(
          'set-business-status',
          { businessId, status, reason: reason ?? null },
          z.object({ status: z.string() }),
        )
      })
    },

    async extendAccess({ businessId, days }) {
      return asDeveloper(async () => {
        return fn(
          'extend-business-access',
          { businessId, days },
          z.object({ accessEndsAt: z.string().nullable() }),
        )
      })
    },

    async createOwnerResetLink(businessId) {
      return asDeveloper(async () => {
        const link = await fn(
          'create-owner-reset-link',
          { businessId },
          z.object({ url: z.string(), ownerEmail: z.string(), expiresAt: z.string() }),
        )
        return { ...link, simulated: false }
      })
    },

    async listActivationCodes() {
      return asDeveloper(async () => {
        const rows = await rpc('admin_list_activation_codes', undefined as never, z.array(codeRow))
        return rows.map((row): AdminActivationCode => ({
          id: row.id,
          ownerEmail: row.owner_email,
          note: row.note,
          status: row.status,
          createdAt: row.created_at,
          redeemBy: row.expires_at,
          accessDays: row.access_days,
          usedAt: row.used_at,
          usedByBusinessName: row.used_by_business_name,
        }))
      })
    },

    async generateActivationCode({ ownerEmail, note, redeemDays, accessDays }) {
      return asDeveloper(async () => {
        const code = await fn(
          'generate-activation-code',
          { ownerEmail, note, expiresInDays: redeemDays, accessDays },
          z.object({
            id: z.string(),
            code: z.string(),
            ownerEmail: z.string(),
            expiresAt: z.string(),
            accessDays: z.number().nullable(),
          }),
        )
        return {
          id: code.id,
          code: code.code,
          ownerEmail: code.ownerEmail,
          redeemBy: code.expiresAt,
          accessDays: code.accessDays,
        }
      })
    },

    async revokeActivationCode(codeId) {
      return asDeveloper(async () => {
        await fn('revoke-activation-code', { codeId }, z.unknown())
      })
    },
  }

  return { auth, registration, staff, admin }
}
