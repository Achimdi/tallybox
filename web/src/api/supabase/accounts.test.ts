import { describe, expect, it } from 'vitest'
import { fromAuthError, interpretSessionState, type RawSessionState } from './accounts'

const member = (
  overrides: Partial<Extract<RawSessionState, { kind: 'member' }>> = {},
): RawSessionState => ({
  kind: 'member',
  user_id: 'user-1',
  role: 'owner',
  display_name: 'Amaka Okoro',
  username: null,
  active: true,
  access: 'ok',
  business: {
    id: 'biz-1',
    name: 'Sunrise Pharmacy',
    business_code: 'sunrise',
    currency_code: 'NGN',
    timezone: 'Africa/Lagos',
    access_ends_at: '2026-12-01T00:00:00Z',
  },
  ...overrides,
})

describe('who the database says someone is', () => {
  it('lets an owner in with their business details and email', () => {
    expect(interpretSessionState(member(), 'owner@shop.test')).toEqual({
      kind: 'user',
      user: {
        id: 'user-1',
        role: 'owner',
        displayName: 'Amaka Okoro',
        email: 'owner@shop.test',
        username: null,
        businessId: 'biz-1',
        businessName: 'Sunrise Pharmacy',
        businessCode: 'sunrise',
        currencyCode: 'NGN',
        timezone: 'Africa/Lagos',
        accessEndsAt: '2026-12-01T00:00:00Z',
      },
    })
  })

  it("never shows a staff member's made-up sign-in address", () => {
    const result = interpretSessionState(
      member({ role: 'staff', username: 'ada' }),
      'ada@sunrise.staff.tallybox.invalid',
    )
    expect(result).toMatchObject({
      kind: 'user',
      user: { role: 'staff', email: null, username: 'ada' },
    })
  })

  it('reports a blocked business before a turned-off account', () => {
    expect(interpretSessionState(member({ access: 'suspended', active: false }), null)).toEqual({
      kind: 'blocked',
      notice: { reason: 'suspended', businessName: 'Sunrise Pharmacy', accessEndedAt: null },
    })
    expect(interpretSessionState(member({ access: 'ended' }), null)).toEqual({
      kind: 'blocked',
      notice: {
        reason: 'access_ended',
        businessName: 'Sunrise Pharmacy',
        accessEndedAt: '2026-12-01T00:00:00Z',
      },
    })
    expect(interpretSessionState(member({ active: false }), null)).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'disabled' },
    })
  })

  it('knows the developer, and blocks an account that belongs nowhere', () => {
    expect(
      interpretSessionState({ kind: 'super_admin', user_id: 'dev' }, 'dev@x.test'),
    ).toMatchObject({
      kind: 'user',
      user: { role: 'super_admin', businessId: null, email: 'dev@x.test' },
    })
    expect(interpretSessionState({ kind: 'none', user_id: 'x' }, null)).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'no_profile' },
    })
  })
})

describe('sign-in errors', () => {
  const online = () => true
  it('maps known Supabase codes, and reads anything else as wrong details', () => {
    expect(fromAuthError({ code: 'invalid_credentials', status: 400 }, online).code).toBe(
      'invalid_credentials',
    )
    expect(fromAuthError({ code: 'weak_password', status: 422 }, online).code).toBe('weak_password')
    // Supabase's answers with require_current_password on (checked on the dev project).
    expect(fromAuthError({ code: 'current_password_invalid', status: 400 }, online).code).toBe(
      'wrong_password',
    )
    expect(fromAuthError({ code: 'current_password_required', status: 400 }, online).code).toBe(
      'wrong_password',
    )
    expect(fromAuthError({ code: 'same_password', status: 422 }, online).code).toBe('weak_password')
    expect(fromAuthError({ code: 'email_not_confirmed', status: 400 }, online).code).toBe(
      'invalid_credentials',
    )
    expect(fromAuthError({ status: 429 }, online).code).toBe('rate_limited')
    expect(fromAuthError({ status: 503 }, online).code).toBe('server')
  })

  it('says offline when the request never got an answer and the device is offline', () => {
    expect(fromAuthError({}, () => false).code).toBe('offline')
    expect(fromAuthError({}, online).code).toBe('server')
  })
})
