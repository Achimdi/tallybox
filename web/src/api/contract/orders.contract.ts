import { beforeEach, describe, expect, it } from 'vitest'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type { CreateOrderInput, Item, SignInInput, TallyboxApi } from '../types'

/**
 * The contract for selling: items, orders, held orders and password changes.
 * Runs against the mock now and against Supabase in Phase 2.
 *
 * Items cannot be created through the API until step 1C, so the fixture
 * provides a shop that already has stock: an owner and two staff members.
 */

export interface ShopFixture {
  /** A fresh browser, signed out. */
  api: TallyboxApi
  /** Another browser on the same data. */
  otherBrowser: () => TallyboxApi
  owner: SignInInput
  staffA: SignInInput
  staffB: SignInInput
}

/** The parts of the app a contract test can need, for implementations built step by step. */
export type ShopFeature = 'orders' | 'dashboard' | 'reports' | 'staffManagement' | 'settings'

/** True when `available` (left out: everything) has every needed part. */
export function hasFeatures(
  available: readonly ShopFeature[] | undefined,
  needed: readonly ShopFeature[],
): boolean {
  return !available || needed.every((feature) => available.includes(feature))
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('Expected the call to fail')
}

async function codeOf(promise: Promise<unknown>): Promise<AppErrorCode> {
  return (await errorOf(promise)).code
}

export function describeOrdersContract(name: string, setup: () => Promise<ShopFixture>) {
  describe(`TallyboxApi contract: selling (${name})`, () => {
    let fixture: ShopFixture
    let api: TallyboxApi

    beforeEach(async () => {
      fixture = await setup()
      api = fixture.api
    })

    const signIn = async (account: SignInInput, target = api) => {
      const result = await target.auth.signIn(account)
      if (result.kind !== 'user') throw new Error('fixture account could not sign in')
      return result.user
    }

    /** Two items that have plenty of stock, for ordinary orders. */
    async function stockedItems(target = api): Promise<[Item, Item]> {
      const items = (await target.items.list()).filter((item) => item.quantity >= 10)
      if (items.length < 2) throw new Error('fixture needs two items with at least 10 in stock')
      return [items[0]!, items[1]!]
    }

    const order = (
      lines: CreateOrderInput['lines'],
      extra: Partial<CreateOrderInput> = {},
    ): CreateOrderInput => ({
      clientOrderId: crypto.randomUUID(),
      lines,
      paymentMethod: 'cash',
      paymentReference: '',
      paymentConfirmed: true,
      customerName: '',
      customerPhone: '',
      note: '',
      ...extra,
    })

    const quantityOf = async (itemId: string, target = api) =>
      (await target.items.list()).find((item) => item.id === itemId)?.quantity

    // --- Items ---------------------------------------------------------------

    it('shows staff the items on sale, sorted by name, with price and stock', async () => {
      await signIn(fixture.staffA)
      const items = await api.items.list()
      expect(items.length).toBeGreaterThan(1)
      expect(items.every((item) => item.active)).toBe(true)
      expect(items.map((item) => item.name)).toEqual(
        [...items.map((item) => item.name)].sort((a, b) => a.localeCompare(b)),
      )
      expect(typeof items[0]?.price).toBe('number')
      expect(typeof items[0]?.quantity).toBe('number')
      expect(JSON.stringify(items)).not.toMatch(/cost/i)
    })

    it('refuses a visitor who is not signed in', async () => {
      expect(await codeOf(api.items.list())).toBe('unauthenticated')
      expect(await codeOf(api.orders.listMine())).toBe('unauthenticated')
    })

    // --- Confirming orders -------------------------------------------------

    it('never confirms an order before payment is ticked as received', async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      const before = await quantityOf(item.id)
      const ordersBefore = (await api.orders.listMine()).length
      expect(
        await codeOf(
          api.orders.create(order([{ itemId: item.id, quantity: 1 }], { paymentConfirmed: false })),
        ),
      ).toBe('payment_not_confirmed')
      expect(await quantityOf(item.id)).toBe(before)
      expect(await api.orders.listMine()).toHaveLength(ordersBefore)
    })

    it('confirms an order: prices from the item list, stock down, listed for its taker', async () => {
      const staff = await signIn(fixture.staffA)
      const [first, second] = await stockedItems()

      const created = await api.orders.create(
        order(
          [
            { itemId: first.id, quantity: 2 },
            { itemId: second.id, quantity: 1 },
            { itemId: first.id, quantity: 1 },
          ],
          {
            paymentMethod: 'bank_transfer',
            paymentReference: ' TRF-123 ',
            customerName: ' Mrs Bello ',
            customerPhone: '0803 000 0002',
            note: '',
          },
        ),
      )

      expect(created).toMatchObject({
        status: 'completed',
        staffId: staff.id,
        staffName: staff.displayName,
        paymentMethod: 'bank_transfer',
        paymentReference: 'TRF-123',
        paymentConfirmedByName: staff.displayName,
        customerName: 'Mrs Bello',
        note: null,
        total: first.price * 3 + second.price,
      })
      expect(created.lines).toEqual([
        {
          itemId: first.id,
          name: first.name,
          unitPrice: first.price,
          quantity: 3,
          lineTotal: first.price * 3,
        },
        {
          itemId: second.id,
          name: second.name,
          unitPrice: second.price,
          quantity: 1,
          lineTotal: second.price,
        },
      ])
      expect(created.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      expect(await quantityOf(first.id)).toBe(first.quantity - 3)
      expect(await quantityOf(second.id)).toBe(second.quantity - 1)
      expect((await api.orders.listMine())[0]?.id).toBe(created.id)
      expect(await api.orders.get(created.id)).toEqual(created)
    })

    it('gives each order the next number', async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      const one = await api.orders.create(order([{ itemId: item.id, quantity: 1 }]))
      const two = await api.orders.create(order([{ itemId: item.id, quantity: 1 }]))
      expect(two.orderNumber).toBe(one.orderNumber + 1)
    })

    it('confirms the same order only once, however often it is sent', async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      const input = order([{ itemId: item.id, quantity: 2 }])
      const first = await api.orders.create(input)
      const again = await api.orders.create(input)
      expect(again.id).toBe(first.id)
      expect(await quantityOf(item.id)).toBe(item.quantity - 2)
      expect((await api.orders.listMine()).filter((entry) => entry.id === first.id)).toHaveLength(1)
    })

    it('refuses an order that needs more stock than there is, naming the item', async () => {
      await signIn(fixture.staffA)
      const [first, second] = await stockedItems()
      const error = await errorOf(
        api.orders.create(
          order([
            { itemId: first.id, quantity: 1 },
            { itemId: second.id, quantity: second.quantity + 1 },
          ]),
        ),
      )
      expect(error.code).toBe('insufficient_stock')
      expect(error.details?.problems).toEqual([
        {
          itemId: second.id,
          name: second.name,
          available: second.quantity,
          requested: second.quantity + 1,
        },
      ])
      // Nothing changed, not even the line that was fine.
      expect(await quantityOf(first.id)).toBe(first.quantity)
    })

    it('refuses an empty cart, fractions and unknown items', async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      expect(await codeOf(api.orders.create(order([])))).toBe('validation')
      expect(await codeOf(api.orders.create(order([{ itemId: item.id, quantity: 1.5 }])))).toBe(
        'validation',
      )
      expect(
        await codeOf(api.orders.create(order([{ itemId: 'no-such-item', quantity: 1 }]))),
      ).toBe('item_unavailable')
    })

    // --- Who sees which orders ---------------------------------------------

    it("keeps staff to their own orders, while the owner sees everyone's", async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      const mine = await api.orders.create(order([{ itemId: item.id, quantity: 1 }]))

      const other = fixture.otherBrowser()
      await signIn(fixture.staffB, other)
      expect((await other.orders.listMine()).map((entry) => entry.id)).not.toContain(mine.id)
      expect(await codeOf(other.orders.get(mine.id))).toBe('not_found')

      const owner = fixture.otherBrowser()
      await signIn(fixture.owner, owner)
      expect((await owner.orders.get(mine.id)).id).toBe(mine.id)
    })

    // --- Held orders -------------------------------------------------------

    it('holds an order without taking or reserving stock, and confirming it removes the hold', async () => {
      await signIn(fixture.staffA)
      const [first, second] = await stockedItems()

      const held = await api.held.save({
        lines: [{ itemId: first.id, quantity: 2 }],
        customerName: 'Mr Okafor',
        customerPhone: '',
        note: 'Waiting for the transfer',
      })
      expect(held).toMatchObject({ customerName: 'Mr Okafor', total: first.price * 2 })
      expect(held.lines).toEqual([
        expect.objectContaining({
          itemId: first.id,
          quantity: 2,
          name: first.name,
          unitPrice: first.price,
        }),
      ])
      expect(await quantityOf(first.id)).toBe(first.quantity)

      // Edit the hold: it stays one hold.
      const edited = await api.held.save({
        heldOrderId: held.id,
        lines: [
          { itemId: first.id, quantity: 1 },
          { itemId: second.id, quantity: 1 },
        ],
        customerName: 'Mr Okafor',
        customerPhone: '',
        note: '',
      })
      expect(edited.id).toBe(held.id)
      expect((await api.held.list()).filter((entry) => entry.id === held.id)).toHaveLength(1)

      await api.orders.create(
        order(
          edited.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
          { heldOrderId: held.id },
        ),
      )
      expect((await api.held.list()).map((entry) => entry.id)).not.toContain(held.id)
      expect(await quantityOf(first.id)).toBe(first.quantity - 1)
    })

    it("lets staff see and discard only their own holds, and the owner anyone's", async () => {
      await signIn(fixture.staffA)
      const [item] = await stockedItems()
      const held = await api.held.save({
        lines: [{ itemId: item.id, quantity: 1 }],
        customerName: '',
        customerPhone: '',
        note: '',
      })

      const other = fixture.otherBrowser()
      await signIn(fixture.staffB, other)
      expect((await other.held.list()).map((entry) => entry.id)).not.toContain(held.id)
      expect(await codeOf(other.held.discard(held.id))).toBe('not_found')

      const owner = fixture.otherBrowser()
      await signIn(fixture.owner, owner)
      expect((await owner.held.list()).map((entry) => entry.id)).toContain(held.id)
      await owner.held.discard(held.id)
      expect((await api.held.list()).map((entry) => entry.id)).not.toContain(held.id)
    })

    it('refuses an empty hold', async () => {
      await signIn(fixture.staffA)
      expect(
        await codeOf(api.held.save({ lines: [], customerName: '', customerPhone: '', note: '' })),
      ).toBe('validation')
    })

    // --- Passwords ---------------------------------------------------------

    it('lets a signed-in person change their own password', async () => {
      await signIn(fixture.staffA)
      const current = fixture.staffA.password
      expect(
        await codeOf(
          api.auth.changePassword({
            currentPassword: 'not-it-at-all',
            newPassword: 'new-pass-123',
          }),
        ),
      ).toBe('wrong_password')
      expect(
        await codeOf(api.auth.changePassword({ currentPassword: current, newPassword: 'short' })),
      ).toBe('weak_password')
      await api.auth.changePassword({ currentPassword: current, newPassword: 'new-pass-123' })
      await api.auth.signOut()

      expect(await codeOf(api.auth.signIn(fixture.staffA))).toBe('invalid_credentials')
      expect((await api.auth.signIn({ ...fixture.staffA, password: 'new-pass-123' })).kind).toBe(
        'user',
      )
    })
  })
}
