import { describe, expect, it } from 'vitest'
import { interpretSessionState, sessionStateSchema, type RawSessionState } from './sessionState'

const member: Extract<RawSessionState, { kind: 'member' }> = {
  kind: 'member',
  user_id: 'u1',
  role: 'staff',
  display_name: 'Chidi Eze',
  username: 'chidi',
  active: true,
  access: 'ok',
  business: {
    id: 'b1',
    name: "Ada's Pharmacy",
    business_code: 'adas-pharmacy',
    currency_code: 'NGN',
    timezone: 'Africa/Lagos',
  },
}

describe('interpretSessionState', () => {
  it('lets an active member of a business with access in', () => {
    expect(interpretSessionState(member)).toEqual({
      kind: 'user',
      user: {
        id: 'u1',
        role: 'staff',
        displayName: 'Chidi Eze',
        username: 'chidi',
        businessId: 'b1',
        businessName: "Ada's Pharmacy",
        businessCode: 'adas-pharmacy',
        currencyCode: 'NGN',
        timezone: 'Africa/Lagos',
      },
    })
  })

  it('blocks everyone in a suspended business', () => {
    expect(interpretSessionState({ ...member, access: 'suspended' })).toEqual({
      kind: 'blocked',
      notice: { reason: 'suspended', businessName: "Ada's Pharmacy" },
    })
  })

  it('keeps a lapsed subscription separate from a suspension', () => {
    expect(interpretSessionState({ ...member, access: 'lapsed' })).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'lapsed' },
    })
  })

  it('blocks an account that was turned off', () => {
    expect(interpretSessionState({ ...member, active: false })).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'disabled' },
    })
  })

  it('reports the suspension first when both apply', () => {
    expect(interpretSessionState({ ...member, active: false, access: 'suspended' })).toMatchObject({
      notice: { reason: 'suspended' },
    })
  })

  it('recognises the super-admin, who belongs to no business', () => {
    const result = interpretSessionState({ kind: 'super_admin', user_id: 'dev' })
    expect(result).toMatchObject({
      kind: 'user',
      user: { role: 'super_admin', businessId: null },
    })
  })

  it('blocks an account that belongs to no business', () => {
    expect(interpretSessionState({ kind: 'none', user_id: 'x' })).toEqual({
      kind: 'blocked',
      notice: { reason: 'no_profile', businessName: null },
    })
  })
})

describe('sessionStateSchema', () => {
  it('accepts what the database function returns', () => {
    expect(sessionStateSchema.safeParse(member).success).toBe(true)
  })

  it('refuses a role the app does not know', () => {
    expect(sessionStateSchema.safeParse({ ...member, role: 'manager' }).success).toBe(false)
    expect(sessionStateSchema.safeParse({ kind: 'root', user_id: 'x' }).success).toBe(false)
  })
})
