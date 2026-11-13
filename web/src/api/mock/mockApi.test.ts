import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { createTestApi, DEMO } from '@/test/mockApi'
import { describeAccountsContract } from '../contract/accounts.contract'
import { createMockApi } from './mockApi'
import { memoryStorage, STORAGE_KEY } from './store'

// The shared contract: the Supabase implementation must pass the same tests in Phase 2.
describeAccountsContract('mock', async () => {
  const test = createTestApi()
  return Promise.resolve({
    api: test.api,
    otherBrowser: test.otherBrowser,
    developer: { email: DEMO.developer.email, password: DEMO.developer.password },
    advanceTime: test.advanceTime,
  })
})

describe('mock data layer: the demo itself', () => {
  it('signs in every demo account that should work', async () => {
    const { api } = createTestApi()
    for (const account of [DEMO.developer, DEMO.owner, DEMO.staff]) {
      expect((await api.auth.signIn(account)).kind).toBe('user')
      await api.auth.signOut()
    }
  })

  it('shows each kind of block with the demo accounts', async () => {
    const { api } = createTestApi()
    const signIn = (email: string) =>
      api.auth.signIn({ portal: 'owner', email, password: DEMO.password })

    expect(await signIn('greenleaf@demo.tallybox.test')).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'suspended', businessName: 'Green Leaf Restaurant' },
    })
    expect(await signIn('dailyneeds@demo.tallybox.test')).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'access_ended', businessName: 'Daily Needs Supermarket' },
    })
    expect(await api.auth.signIn({ ...DEMO.staff, username: 'chidi' })).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'disabled' },
    })
    expect(await api.auth.getSession()).toBeNull()
  })

  it('seeds businesses in every access situation for the developer portal', async () => {
    const { api } = createTestApi()
    await api.auth.signIn(DEMO.developer)
    const businesses = await api.admin.listBusinesses()
    expect(
      businesses.map((business) => [business.name, business.status, business.accessFilter]),
    ).toEqual(
      expect.arrayContaining([
        ['Sunrise Pharmacy', 'active', 'ending_soon'],
        ['Corner Mart', 'active', 'ok'],
        ['Green Leaf Restaurant', 'suspended', 'ok'],
        ['Daily Needs Supermarket', 'active', 'ended'],
      ]),
    )
    const statuses = (await api.admin.listActivationCodes()).map((code) => code.status).sort()
    expect(statuses).toEqual(['expired', 'revoked', 'unused', 'used'])
  })

  it('never keeps passwords or activation codes as text', async () => {
    const test = createTestApi()
    await test.api.auth.signIn(DEMO.owner)
    await test.api.staff.create({
      displayName: 'New',
      username: 'newbie',
      password: 'my-real-password',
    })
    await test.api.auth.signOut()
    await test.api.auth.signIn(DEMO.developer)
    const code = await test.api.admin.generateActivationCode({
      ownerEmail: 'someone@example.test',
      note: '',
      redeemDays: 7,
      accessDays: 30,
    })

    const stored = test.storage.get(STORAGE_KEY) ?? ''
    expect(stored).not.toContain('my-real-password')
    expect(stored).not.toContain(DEMO.password)
    expect(stored).not.toContain(code.code)
  })

  it('shares data between browsers but keeps each signed-in person separate', async () => {
    const test = createTestApi()
    const second = test.otherBrowser()
    await test.api.auth.signIn(DEMO.developer)
    await second.auth.signIn(DEMO.owner)
    expect((await test.api.auth.getSession())?.kind).toBe('user')
    expect(await second.auth.getSession()).toMatchObject({ user: { role: 'owner' } })
  })

  it('puts everything back with Reset demo data', async () => {
    const test = createTestApi()
    await test.api.auth.signIn(DEMO.developer)
    await test.api.admin.generateActivationCode({
      ownerEmail: 'a@b.test',
      note: '',
      redeemDays: 7,
      accessDays: 30,
    })
    expect(await test.api.admin.listActivationCodes()).toHaveLength(5)

    await test.api.demo?.reset()
    expect(await test.api.auth.getSession()).toBeNull()
    await test.api.auth.signIn(DEMO.developer)
    expect(await test.api.admin.listActivationCodes()).toHaveLength(4)
  })

  it('fails like a real server when the browser is offline', async () => {
    const api = createMockApi({
      storage: memoryStorage(),
      sessionStorage: memoryStorage(),
      delayMs: 0,
      isOnline: () => false,
    })
    const error = await api.auth.signIn(DEMO.owner).catch((thrown: unknown) => thrown)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe('offline')
  })

  it('limits repeated failed sign-ins on a device', async () => {
    const { api } = createTestApi()
    const codes: string[] = []
    for (let index = 0; index < 11; index += 1) {
      const error = await api.auth
        .signIn({ ...DEMO.owner, password: 'wrong-password' })
        .catch((thrown: unknown) => thrown)
      codes.push((error as AppError).code)
    }
    expect(codes.slice(0, 10).every((code) => code === 'invalid_credentials')).toBe(true)
    expect(codes[10]).toBe('rate_limited')
    // Even the right password waits until the window passes.
    expect(
      await api.auth.signIn(DEMO.owner).catch((thrown: unknown) => (thrown as AppError).code),
    ).toBe('rate_limited')
  })

  it('recovers from unreadable stored data by starting from the demo seed', async () => {
    const storage = memoryStorage()
    storage.set(STORAGE_KEY, '{not json')
    const api = createMockApi({
      storage,
      sessionStorage: memoryStorage(),
      delayMs: 0,
      isOnline: () => true,
    })
    expect((await api.auth.signIn(DEMO.owner)).kind).toBe('user')
  })
})
