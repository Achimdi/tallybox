import { staffEmail } from '@/domain/rules'
import { callRpc } from '@/lib/api'
import { env } from '@/lib/env'
import { AppError, isNetworkFailure, type AppErrorCode } from '@/lib/errors'
import { getSupabase } from '@/lib/supabase'
import type { SignInInput } from './session'
import { interpretSessionState, sessionStateSchema, type InterpretedSession } from './sessionState'

/** Asks the database who the signed-in person is and whether they may use the app. */
export async function fetchSessionState(recordLogin: boolean): Promise<InterpretedSession> {
  const raw = await callRpc(
    'get_session_state',
    { p_record_login: recordLogin },
    sessionStateSchema,
  )
  return interpretSessionState(raw)
}

export async function hasStoredSession(): Promise<boolean> {
  const { data } = await getSupabase().auth.getSession()
  return data.session !== null
}

/** Signs out on this device only. Never throws. */
export async function signOutHere(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' })
  } catch {
    // Already signed out, or offline. Either way this device holds no session now.
  }
}

/** Supabase Auth error codes that have their own message. Everything else is "wrong details". */
const AUTH_CODES: Record<string, AppErrorCode> = {
  invalid_credentials: 'invalid_credentials',
  over_request_rate_limit: 'rate_limited',
  over_email_send_rate_limit: 'rate_limited',
  captcha_failed: 'captcha_failed',
  user_banned: 'account_disabled',
}

function fromAuthError(error: { code?: string; status?: number; message?: string }): AppError {
  if (error.code && AUTH_CODES[error.code]) {
    return new AppError(AUTH_CODES[error.code]!, { cause: error })
  }
  if (error.status === 429) return new AppError('rate_limited', { cause: error })
  if (error.status !== undefined && error.status >= 500) {
    return new AppError('server', { cause: error })
  }
  if (error.status === undefined || error.status === 0 || isNetworkFailure(error)) {
    // No HTTP status means the request never got an answer.
    return new AppError(navigator.onLine ? 'server' : 'offline', { cause: error })
  }
  // Any other refusal (bad email format, unknown user...) is reported the same
  // way as a wrong password, so sign-in never reveals which accounts exist.
  return new AppError('invalid_credentials', { cause: error })
}

/**
 * Signs in through one of the two login pages, then asks the database who this
 * is. Returns a blocked result (already signed out again) for a suspended
 * business or a turned-off account.
 */
export async function signInThroughPortal(input: SignInInput): Promise<InterpretedSession> {
  const supabase = getSupabase()
  const email =
    input.portal === 'owner'
      ? input.email.trim().toLowerCase()
      : staffEmail(input.username, input.businessCode, env.staffEmailDomain)

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
    ...(input.captchaToken ? { options: { captchaToken: input.captchaToken } } : {}),
  })
  if (error) throw fromAuthError(error)

  let result: InterpretedSession
  try {
    result = await fetchSessionState(true)
  } catch (error) {
    await signOutHere()
    throw error
  }

  if (result.kind === 'blocked') {
    await signOutHere()
    return result
  }

  // The owner page also signs in the super-admin. Staff belong on the staff page.
  if (input.portal === 'owner' && result.user.role === 'staff') {
    await signOutHere()
    throw new AppError('wrong_portal')
  }

  return result
}
