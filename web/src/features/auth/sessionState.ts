import { z } from 'zod'
import type { BlockedNotice, SessionUser } from './session'

/**
 * What the database says about the signed-in person (get_session_state).
 * This is the app's source of truth for role and access. The token alone is
 * not: it may have been issued before a suspension.
 */
export const sessionStateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('super_admin'), user_id: z.string() }),
  z.object({ kind: z.literal('none'), user_id: z.string() }),
  z.object({
    kind: z.literal('member'),
    user_id: z.string(),
    role: z.enum(['owner', 'staff']),
    display_name: z.string(),
    username: z.string().nullable(),
    active: z.boolean(),
    access: z.enum(['ok', 'suspended', 'lapsed']),
    business: z.object({
      id: z.string(),
      name: z.string(),
      business_code: z.string(),
      currency_code: z.string(),
      timezone: z.string(),
    }),
  }),
])

export type RawSessionState = z.infer<typeof sessionStateSchema>

export type InterpretedSession =
  { kind: 'user'; user: SessionUser } | { kind: 'blocked'; notice: BlockedNotice }

/** Decides whether the person may use the app, and as whom. */
export function interpretSessionState(state: RawSessionState): InterpretedSession {
  if (state.kind === 'super_admin') {
    return {
      kind: 'user',
      user: {
        id: state.user_id,
        role: 'super_admin',
        displayName: 'Super-admin',
        username: null,
        businessId: null,
        businessName: null,
        businessCode: null,
        currencyCode: null,
        timezone: null,
      },
    }
  }

  if (state.kind === 'none') {
    return { kind: 'blocked', notice: { reason: 'no_profile', businessName: null } }
  }

  // A suspended business is reported before a turned-off account: it is the
  // bigger fact, and it is the same for everyone in the business.
  if (state.access !== 'ok') {
    return {
      kind: 'blocked',
      notice: { reason: state.access, businessName: state.business.name },
    }
  }
  if (!state.active) {
    return { kind: 'blocked', notice: { reason: 'disabled', businessName: state.business.name } }
  }

  return {
    kind: 'user',
    user: {
      id: state.user_id,
      role: state.role,
      displayName: state.display_name,
      username: state.username,
      businessId: state.business.id,
      businessName: state.business.name,
      businessCode: state.business.business_code,
      currencyCode: state.business.currency_code,
      timezone: state.business.timezone,
    },
  }
}
