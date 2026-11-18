import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { createTestApi, DEMO } from '@/test/mockApi'
import { describeAccountsContract } from '../contract/accounts.contract'
import { describeOrdersContract } from '../contract/orders.contract'
import { describeOwnerContract } from '../contract/owner.contract'
import { describeSuppliesContract } from '../contract/supplies.contract'
import { createMockApi } from './mockApi'
import { memoryStorage, STORAGE_KEY, type MockDb } from './store'

// The shared contract: the Supabase implementation passes the same tests (npm run test:live).
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

    expect(await signIn('harbour@demo.tallybox.test')).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'suspended', businessName: 'Harbour Bakery' },
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
        ['Green Leaf Restaurant', 'active', 'ok'],
        ['Harbour Bakery', 'suspended', 'ok'],
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

describeOrdersContract('mock', async () => {
  const test = createTestApi()
  return Promise.resolve({
    api: test.api,
    otherBrowser: test.otherBrowser,
    owner: DEMO.owner,
    staffA: DEMO.staff,
    staffB: { ...DEMO.staff, username: 'bola' },
  })
})

describeOwnerContract('mock', async () => {
  const test = createTestApi()
  return Promise.resolve({
    api: test.api,
    otherBrowser: test.otherBrowser,
    owner: DEMO.owner,
    staffA: DEMO.staff,
    staffB: { ...DEMO.staff, username: 'bola' },
  })
})

describeSuppliesContract('mock', async () => {
  const test = createTestApi()
  return Promise.resolve({
    api: test.api,
    otherBrowser: test.otherBrowser,
    owner: DEMO.owner,
    staffA: DEMO.staff,
    staffB: { ...DEMO.staff, username: 'bola' },
  })
})

describe('mock data layer: the demo shop and its stock ledger', () => {
  /** Reads the stored demo data, the way a database test would read tables. */
  function stored(test: ReturnType<typeof createTestApi>): MockDb {
    return JSON.parse(test.storage.get(STORAGE_KEY) ?? '{}') as MockDb
  }

  function expectLedgerMatchesStock(db: MockDb) {
    for (const item of db.items) {
      const moves = db.stockMovements.filter((move) => move.itemId === item.id)
      expect(
        moves.reduce((sum, move) => sum + move.delta, 0),
        item.name,
      ).toBe(item.quantity)
      for (const move of moves) {
        expect(move.quantityAfter, item.name).toBe(move.quantityBefore + move.delta)
        expect(move.quantityAfter, item.name).toBeGreaterThanOrEqual(0)
      }
    }
    // Shared supplies follow the same rule.
    for (const supply of db.supplies) {
      const moves = db.stockMovements.filter((move) => move.supplyId === supply.id)
      expect(
        moves.reduce((sum, move) => sum + move.delta, 0),
        supply.name,
      ).toBe(supply.quantity)
      for (const move of moves) {
        expect(move.quantityAfter, supply.name).toBe(move.quantityBefore + move.delta)
        expect(move.quantityAfter, supply.name).toBeGreaterThanOrEqual(0)
      }
    }
    // Every entry belongs to exactly one of the two.
    for (const move of db.stockMovements) {
      expect(Boolean(move.itemId) !== Boolean(move.supplyId), move.id).toBe(true)
    }
  }

  it('seeds a drinks business whose drinks share 1,000 bottles and caps', async () => {
    const test = createTestApi()
    await test.api.auth.signIn({
      portal: 'owner',
      email: 'greenleaf@demo.tallybox.test',
      password: DEMO.password,
    })
    const supplies = await test.api.supplies.list()
    expect(supplies.map((supply) => supply.name)).toEqual(['300 ml bottle', 'Bottle cap'])
    const bottle = supplies[0]!
    expect(bottle.usedBy.map((use) => use.name)).toEqual([
      'Apple juice 300ml',
      'Coke 300ml',
      'Fanta 300ml',
      'Zobo 300ml',
    ])
    const opening = await test.api.stock.movements({ supplyId: bottle.id, type: 'opening' })
    expect(opening.rows[0]?.delta).toBe(1000)

    const items = await test.api.items.list()
    const named = (name: string) => items.find((item) => item.name === name)!
    // Supplies only, both, and neither.
    expect(named('Coke 300ml')).toMatchObject({ tracksOwnStock: false, available: bottle.quantity })
    expect(named('Apple juice 300ml')).toMatchObject({ tracksOwnStock: true, quantity: 790 })
    expect(named('Jollof rice')).toMatchObject({ tracksOwnStock: false, available: null })
    expectLedgerMatchesStock(stored(test))

    // Staff of that business see what can be sold, and it is a separate business from Sunrise.
    const staff = test.otherBrowser()
    await staff.auth.signIn({ ...DEMO.staff, businessCode: 'green-leaf', username: 'tobi' })
    expect((await staff.items.list()).map((item) => item.name)).toContain('Zobo 300ml')
    const sunrise = test.otherBrowser()
    await sunrise.auth.signIn(DEMO.owner)
    expect(await sunrise.supplies.list()).toEqual([])
    expect((await sunrise.items.list()).some((item) => item.name === 'Zobo 300ml')).toBe(false)
  })

  it('seeds a realistic shop', async () => {
    const test = createTestApi()
    await test.api.auth.signIn(DEMO.owner)
    const items = await test.api.items.list()
    expect(items).toHaveLength(40)
    expect(items.filter((item) => !item.active)).toHaveLength(1)
    expect(
      items.filter((item) => item.active && item.quantity === 0).length,
    ).toBeGreaterThanOrEqual(2)
    expect(
      items.filter((item) => item.quantity > 0 && item.quantity <= item.lowStockLevel).length,
    ).toBeGreaterThanOrEqual(3)
    expect(new Set(items.map((item) => item.category)).size).toBe(6)

    const db = stored(test)
    expect(db.orders.length).toBeGreaterThan(30)
    expect(db.orders.filter((order) => order.status === 'voided')).toHaveLength(1)
    expect(db.heldOrders).toHaveLength(1)
    expect(new Set(db.orders.map((order) => order.paymentMethod))).toEqual(
      new Set(['cash', 'bank_transfer', 'card']),
    )
  })

  it('gives demo staff some orders today and a held order', async () => {
    const test = createTestApi()
    await test.api.auth.signIn(DEMO.staff)
    expect((await test.api.orders.listMine()).length).toBeGreaterThan(0)
    expect(await test.api.held.list()).toEqual([
      expect.objectContaining({ customerName: 'Mrs Bello', staffName: 'Ada Eze' }),
    ])
  })

  it("keeps every item's quantity equal to the sum of its ledger, before and after selling", async () => {
    const test = createTestApi()
    await test.api.auth.signIn(DEMO.staff)
    await test.api.items.list()
    expectLedgerMatchesStock(stored(test))

    const items = (await test.api.items.list()).filter((item) => item.quantity >= 5)
    for (const item of items.slice(0, 5)) {
      await test.api.orders.create({
        clientOrderId: crypto.randomUUID(),
        lines: [{ itemId: item.id, quantity: 2 }],
        paymentMethod: 'cash',
        paymentReference: '',
        paymentConfirmed: true,
        customerName: '',
        customerPhone: '',
        note: '',
      })
    }
    expectLedgerMatchesStock(stored(test))
  })
})
