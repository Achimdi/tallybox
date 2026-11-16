// Creating Supabase Auth users from Edge Functions.

import type { Context } from './handler.ts'
import { type ErrorCode, HttpError } from './http.ts'

interface NewUser {
  email: string
  password: string
  role: 'owner' | 'staff'
  businessId: string
  /** What "this address already exists" means for this kind of account. */
  duplicateCode: ErrorCode
}

/**
 * Creates the Auth user. Role and business go into app_metadata, which only
 * the server can write: a user cannot change their own role or business.
 */
export async function createAuthUser(context: Context<unknown>, user: NewUser): Promise<string> {
  const { userId, errorCode } = await context.admin.createUser({
    email: user.email,
    password: user.password,
    app_metadata: { role: user.role, business_id: user.businessId },
  })
  if (userId) return userId

  if (errorCode === 'email_exists' || errorCode === 'user_already_exists') {
    throw new HttpError(user.duplicateCode)
  }
  if (errorCode === 'weak_password') throw new HttpError('weak_password')

  // Worth its own log line: if Supabase ever refuses the made-up staff address,
  // this is how it shows up (see DEFAULT_STAFF_EMAIL_DOMAIN in rules.ts).
  context.deps.log({
    level: 'error',
    event: 'auth_user_not_created',
    fn: 'accounts',
    role: user.role,
    authErrorCode: errorCode ?? 'unknown',
  })
  throw new HttpError('server')
}

/**
 * Runs the database step that goes with a new Auth user. If it fails, the Auth
 * user is removed again, so an account is never left half-created.
 */
export async function withCompensation<Result>(
  context: Context<unknown>,
  userId: string,
  databaseStep: () => Promise<Result>,
): Promise<Result> {
  try {
    return await databaseStep()
  } catch (error) {
    const { ok } = await context.admin.deleteUser(userId)
    if (!ok) {
      context.deps.log({ level: 'error', event: 'orphan_auth_user', fn: 'accounts' })
    }
    throw error
  }
}
