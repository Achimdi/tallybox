import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS } from '@/domain/access'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type { RegistrationInput, SessionResult, TallyboxApi } from '../types'

/**
 * The contract every TallyboxApi implementation must keep, for sign-in,
 * registration, staff accounts and the developer portal.
 *
 * It runs against the mock now (src/api/mock/mockApi.test.ts) and against the
 * Supabase implementation in Phase 2, so both behave identically. It uses only
 * the public API: no peeking into how data is stored.
 */

export interface ContractFixture {
  /** "This browser": the API under test, signed out. */
  api: TallyboxApi
  /** A second browser on the same data, with its own signed-in person. */
  otherBrowser: () => TallyboxApi
  /** An existing developer (super-admin) account. */
  developer: { email: string; password: string }
  /** Moves the clock forward, where the implementation allows it (tests skip otherwise). */
  advanceTime?: (ms: number) => void
}

async function errorCode(promise: Promise<unknown>): Promise<AppErrorCode> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return (error as AppError).code
  }
  throw new Error('Expected the call to fail')
}

function expectUser(result: SessionResult | null) {
  expect(result?.kind).toBe('user')
  if (result?.kind !== 'user') throw new Error('not a user')
  return result.user
}

let counter = 0
/** Unique values per test, so tests never collide on shared data. */
function unique(prefix: string) {
  counter += 1
  const id = `${Date.now().toString(36)}${counter}`
  return {
    email: `${prefix}.${id}@contract.test`,
    businessCode: `${prefix}-${id}`.slice(0, 20).replace(/-$/, 'x'),
  }
}

export function describeAccountsContract(name: string, setup: () => Promise<ContractFixture>) {
  describe(`TallyboxApi contract: accounts (${name})`, () => {
    let fixture: ContractFixture
    let api: TallyboxApi

    beforeEach(async () => {
      fixture = await setup()
      api = fixture.api
    })

    const signInDeveloper = async (target = api) =>
      expectUser(await target.auth.signIn({ portal: 'owner', ...fixture.developer }))

    /** The developer generates a code, then this browser registers a business with it. */
    async function registerBusiness(
      overrides: Partial<RegistrationInput> & { accessDays?: number | null } = {},
    ) {
      const ids = unique('shop')
      const email = overrides.email ?? ids.email
      await signInDeveloper()
      const code = await api.admin.generateActivationCode({
        ownerEmail: email,
        note: 'contract test',
        redeemDays: 7,
        accessDays: overrides.accessDays === undefined ? 30 : overrides.accessDays,
      })
      await api.auth.signOut()
      const input: RegistrationInput = {
        businessName: 'Contract Shop',
        businessCode: ids.businessCode,
        ownerName: 'Contract Owner',
        email,
        password: 'owner-pass-1',
        phone: '',
        activationCode: code.code,
        timezone: 'Africa/Lagos',
        ...overrides,
      }
      const result = await api.registration.registerBusiness(input)
      return { input, code, businessCode: result.businessCode }
    }

    async function businessIdFor(businessCode: string) {
      await signInDeveloper()
      const businesses = await api.admin.listBusinesses()
      const business = businesses.find((candidate) => candidate.businessCode === businessCode)
      if (!business) throw new Error('business not listed')
      await api.auth.signOut()
      return business.id
    }

    // --- Sessions ----------------------------------------------------------

    it('starts signed out, and signs the developer in and out', async () => {
      expect(await api.auth.getSession()).toBeNull()
      const user = await signInDeveloper()
      expect(user.role).toBe('super_admin')
      expect(user.businessId).toBeNull()
      expect(expectUser(await api.auth.getSession()).id).toBe(user.id)
      await api.auth.signOut()
      expect(await api.auth.getSession()).toBeNull()
    })

    it('refuses a wrong password with the same answer as an unknown email', async () => {
      expect(
        await errorCode(
          api.auth.signIn({
            portal: 'owner',
            email: fixture.developer.email,
            password: 'wrong-pass',
          }),
        ),
      ).toBe('invalid_credentials')
      expect(
        await errorCode(
          api.auth.signIn({ portal: 'owner', email: 'nobody@nowhere.test', password: 'whatever1' }),
        ),
      ).toBe('invalid_credentials')
    })

    // --- Activation codes --------------------------------------------------

    it('lets the developer generate a code that is listed as unused', async () => {
      await signInDeveloper()
      const email = unique('code').email
      const code = await api.admin.generateActivationCode({
        ownerEmail: ` ${email.toUpperCase()} `,
        note: 'Corner shop',
        redeemDays: 7,
        accessDays: 90,
      })
      expect(code.code).toMatch(/^TB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/)
      expect(code.ownerEmail).toBe(email)
      expect(code.accessDays).toBe(90)

      const listed = (await api.admin.listActivationCodes()).find((entry) => entry.id === code.id)
      expect(listed).toMatchObject({
        ownerEmail: email,
        status: 'unused',
        accessDays: 90,
        note: 'Corner shop',
      })
      // The code itself is never listed again.
      expect(JSON.stringify(listed)).not.toContain(code.code)
    })

    it('hides the developer portal from everyone else', async () => {
      expect(await errorCode(api.admin.listBusinesses())).toBe('not_found')
      const { input } = await registerBusiness()
      await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password })
      expect(await errorCode(api.admin.listBusinesses())).toBe('not_found')
      expect(await errorCode(api.admin.listActivationCodes())).toBe('not_found')
      expect(
        await errorCode(
          api.admin.generateActivationCode({
            ownerEmail: 'x@y.test',
            note: '',
            redeemDays: 7,
            accessDays: 30,
          }),
        ),
      ).toBe('not_found')
    })

    it('revokes an unused code, and only an unused one', async () => {
      await signInDeveloper()
      const email = unique('revoke').email
      const code = await api.admin.generateActivationCode({
        ownerEmail: email,
        note: '',
        redeemDays: 7,
        accessDays: 30,
      })
      await api.admin.revokeActivationCode(code.id)
      expect(await errorCode(api.admin.revokeActivationCode(code.id))).toBe('conflict')
      await api.auth.signOut()

      const ids = unique('revoke')
      expect(
        await errorCode(
          api.registration.registerBusiness({
            businessName: 'Revoked Shop',
            businessCode: ids.businessCode,
            ownerName: 'Someone',
            email,
            password: 'owner-pass-1',
            phone: '',
            activationCode: code.code,
            timezone: 'UTC',
          }),
        ),
      ).toBe('activation_code_revoked')
    })

    // --- Registration ------------------------------------------------------

    it('registers a business with a valid code and starts its access period', async () => {
      const before = Date.now()
      const { input, code, businessCode } = await registerBusiness({ accessDays: 90 })
      expect(businessCode).toBe(input.businessCode.toLowerCase())

      const owner = expectUser(
        await api.auth.signIn({
          portal: 'owner',
          email: input.email.toUpperCase(),
          password: input.password,
        }),
      )
      expect(owner).toMatchObject({ role: 'owner', businessName: 'Contract Shop', businessCode })
      const ends = new Date(owner.accessEndsAt ?? 0).getTime()
      expect(ends).toBeGreaterThanOrEqual(before + 90 * DAY_MS - 60_000)

      await api.auth.signOut()
      await signInDeveloper()
      const listed = (await api.admin.listActivationCodes()).find((entry) => entry.id === code.id)
      expect(listed).toMatchObject({ status: 'used', usedByBusinessName: 'Contract Shop' })
    })

    it('sets no password through the reset path without a real reset link', async () => {
      expect(await api.auth.readPasswordResetLink()).toBeNull()
      expect(
        await errorCode(api.auth.completePasswordReset({ newPassword: 'other-pass-123' })),
      ).toBe('reset_link_invalid')

      // Even signed in normally: only opening a one-time link allows it.
      const { input } = await registerBusiness()
      expectUser(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      )
      expect(await api.auth.readPasswordResetLink()).toBeNull()
      expect(
        await errorCode(api.auth.completePasswordReset({ newPassword: 'other-pass-123' })),
      ).toBe('reset_link_invalid')
      await api.auth.signOut()
      expectUser(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      )
    })

    it('gives open-ended access when the code says so', async () => {
      const { input } = await registerBusiness({ accessDays: null })
      const owner = expectUser(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      )
      expect(owner.accessEndsAt).toBeNull()
    })

    it('uses a code only once', async () => {
      const { input } = await registerBusiness()
      expect(
        await errorCode(
          api.registration.registerBusiness({
            ...input,
            businessCode: unique('again').businessCode,
          }),
        ),
      ).toBe('activation_code_used')
    })

    it('refuses a code for a different email, a taken business code and a taken email', async () => {
      const first = await registerBusiness()

      await signInDeveloper()
      const email = unique('second').email
      const code = await api.admin.generateActivationCode({
        ownerEmail: email,
        note: '',
        redeemDays: 7,
        accessDays: 30,
      })
      await api.auth.signOut()
      const base: RegistrationInput = {
        businessName: 'Second Shop',
        businessCode: unique('second').businessCode,
        ownerName: 'Second Owner',
        email,
        password: 'owner-pass-1',
        phone: '',
        activationCode: code.code,
        timezone: 'UTC',
      }

      expect(
        await errorCode(
          api.registration.registerBusiness({ ...base, email: 'other@contract.test' }),
        ),
      ).toBe('activation_code_invalid')
      expect(
        await errorCode(
          api.registration.registerBusiness({ ...base, businessCode: first.businessCode }),
        ),
      ).toBe('business_code_taken')
      expect(await api.registration.isBusinessCodeAvailable(first.businessCode)).toBe(false)
      expect(await api.registration.isBusinessCodeAvailable(base.businessCode)).toBe(true)
      expect(await api.registration.isBusinessCodeAvailable('Admin')).toBe(false)

      // The refused attempts used nothing up: the code still works.
      await expect(api.registration.registerBusiness(base)).resolves.toEqual({
        businessCode: base.businessCode,
      })
    })

    it('limits repeated wrong activation codes', async () => {
      const ids = unique('guess')
      const attempt = () =>
        api.registration.registerBusiness({
          businessName: 'Guessing Shop',
          businessCode: ids.businessCode,
          ownerName: 'Guesser',
          email: ids.email,
          password: 'owner-pass-1',
          phone: '',
          activationCode: 'TB-2222-2222',
          timezone: 'UTC',
        })
      const codes: AppErrorCode[] = []
      for (let index = 0; index < 6; index += 1) codes.push(await errorCode(attempt()))
      expect(codes.slice(0, 5)).toEqual(Array(5).fill('activation_code_invalid'))
      expect(codes[5]).toBe('rate_limited')
    })

    // --- Staff accounts ----------------------------------------------------

    it('lets an owner create staff, who sign in with business code and username', async () => {
      const { input, businessCode } = await registerBusiness()
      await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password })
      const staff = await api.staff.create({
        displayName: ' Chidi Eze ',
        username: ' Chidi ',
        password: 'staff-pass-1',
      })
      expect(staff).toMatchObject({ displayName: 'Chidi Eze', username: 'chidi', active: true })
      expect((await api.staff.list()).map((member) => member.username)).toEqual(['chidi'])
      expect(
        await errorCode(
          api.staff.create({ displayName: 'Other', username: 'chidi', password: 'staff-pass-2' }),
        ),
      ).toBe('username_taken')
      await api.auth.signOut()

      const user = expectUser(
        await api.auth.signIn({
          portal: 'staff',
          businessCode: businessCode.toUpperCase(),
          username: 'CHIDI',
          password: 'staff-pass-1',
        }),
      )
      expect(user).toMatchObject({ role: 'staff', username: 'chidi', businessCode })
      // Staff cannot manage staff.
      expect(await errorCode(api.staff.list())).toBe('permission_denied')
      await api.auth.signOut()

      for (const wrong of [
        { businessCode, username: 'chidi', password: 'wrong-pass' },
        { businessCode, username: 'nobody', password: 'staff-pass-1' },
        { businessCode: 'no-such-shop', username: 'chidi', password: 'staff-pass-1' },
      ]) {
        expect(await errorCode(api.auth.signIn({ portal: 'staff', ...wrong }))).toBe(
          'invalid_credentials',
        )
      }
    })

    it("keeps each business's staff apart", async () => {
      const a = await registerBusiness()
      await api.auth.signIn({ portal: 'owner', email: a.input.email, password: a.input.password })
      await api.staff.create({ displayName: 'Ada', username: 'ada', password: 'staff-pass-1' })
      await api.auth.signOut()

      const b = await registerBusiness()
      await api.auth.signIn({ portal: 'owner', email: b.input.email, password: b.input.password })
      expect(await api.staff.list()).toEqual([])
      // The same username is fine in another business.
      await expect(
        api.staff.create({ displayName: 'Ada B', username: 'ada', password: 'staff-pass-1' }),
      ).resolves.toBeTruthy()
    })

    // --- Suspension --------------------------------------------------------

    it('locks a suspended business out straight away, and lets it back in when reactivated', async () => {
      const { input, businessCode } = await registerBusiness()
      const businessId = await businessIdFor(businessCode)

      // The owner is signed in, in another browser.
      const ownerBrowser = fixture.otherBrowser()
      await ownerBrowser.auth.signIn({
        portal: 'owner',
        email: input.email,
        password: input.password,
      })

      await signInDeveloper()
      expect(
        await errorCode(
          api.admin.setBusinessStatus({ businessId, status: 'suspended', reason: '  ' }),
        ),
      ).toBe('validation')
      await api.admin.setBusinessStatus({
        businessId,
        status: 'suspended',
        reason: 'Unpaid (contract test)',
      })
      expect(await api.admin.getBusiness(businessId)).toMatchObject({
        status: 'suspended',
        suspendedReason: 'Unpaid (contract test)',
      })

      expect(await ownerBrowser.auth.getSession()).toMatchObject({
        kind: 'blocked',
        notice: { reason: 'suspended', businessName: 'Contract Shop' },
      })
      expect(await ownerBrowser.auth.getSession()).toBeNull()
      expect(
        await ownerBrowser.auth.signIn({
          portal: 'owner',
          email: input.email,
          password: input.password,
        }),
      ).toMatchObject({
        kind: 'blocked',
        notice: { reason: 'suspended' },
      })
      expect(await errorCode(ownerBrowser.staff.list())).toBe('unauthenticated')

      await api.admin.setBusinessStatus({ businessId, status: 'active' })
      expect(await api.admin.getBusiness(businessId)).toMatchObject({
        status: 'active',
        suspendedReason: null,
      })
      expectUser(
        await ownerBrowser.auth.signIn({
          portal: 'owner',
          email: input.email,
          password: input.password,
        }),
      )
    })

    // --- Access periods ----------------------------------------------------

    it('extends access from the current end date, or makes it open-ended', async () => {
      const { businessCode } = await registerBusiness({ accessDays: 30 })
      const businessId = await businessIdFor(businessCode)
      await signInDeveloper()

      const before = await api.admin.getBusiness(businessId)
      const { accessEndsAt } = await api.admin.extendAccess({ businessId, days: 90 })
      expect(
        new Date(accessEndsAt ?? 0).getTime() - new Date(before.accessEndsAt ?? 0).getTime(),
      ).toBe(90 * DAY_MS)

      expect(await errorCode(api.admin.extendAccess({ businessId, days: 0 }))).toBe('validation')
      expect(await api.admin.extendAccess({ businessId, days: null })).toEqual({
        accessEndsAt: null,
      })
      expect((await api.admin.getBusiness(businessId)).accessEndsAt).toBeNull()
    })

    it('locks a business when its access period and grace period end, until extended', async (context) => {
      if (!fixture.advanceTime) context.skip()
      const { input, businessCode } = await registerBusiness({ accessDays: 30 })
      const businessId = await businessIdFor(businessCode)

      // Ended, but still within the 3-day grace period.
      fixture.advanceTime!(31 * DAY_MS)
      expectUser(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      )
      await api.auth.signOut()

      fixture.advanceTime!(3 * DAY_MS)
      expect(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      ).toMatchObject({
        kind: 'blocked',
        notice: { reason: 'access_ended', businessName: 'Contract Shop' },
      })

      await signInDeveloper()
      expect(await api.admin.getBusiness(businessId)).toMatchObject({ accessFilter: 'ended' })
      const { accessEndsAt } = await api.admin.extendAccess({ businessId, days: 30 })
      // Extending after the end counts from today, not from the old end date.
      expect(new Date(accessEndsAt ?? 0).getTime()).toBeGreaterThan(Date.now() + 33 * DAY_MS)
      await api.auth.signOut()

      expectUser(
        await api.auth.signIn({ portal: 'owner', email: input.email, password: input.password }),
      )
    })

    it('makes a one-time owner reset link for the developer', async () => {
      const { input, businessCode } = await registerBusiness()
      const businessId = await businessIdFor(businessCode)
      await signInDeveloper()
      const link = await api.admin.createOwnerResetLink(businessId)
      expect(link.ownerEmail).toBe(input.email)
      expect(link.url).toMatch(/^https:\/\//)
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now())
    })
  })
}
