import { beforeEach, describe, expect, it } from 'vitest'
import { addDays } from '@/lib/dates'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type { ItemInput, TallyboxApi } from '../types'
import type { ShopFixture } from './orders.contract'

/**
 * The contract for running a business: items, stock, voids, the owner's order
 * list, the dashboard, staff accounts and business settings.
 * Runs against the mock now and against Supabase in Phase 2.
 */

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('Expected the call to fail')
}

const codeOf = async (promise: Promise<unknown>): Promise<AppErrorCode> =>
  (await errorOf(promise)).code

export function describeOwnerContract(name: string, setup: () => Promise<ShopFixture>) {
  describe(`TallyboxApi contract: running the business (${name})`, () => {
    let fixture: ShopFixture
    let owner: TallyboxApi
    let staff: TallyboxApi
    let today: string

    beforeEach(async () => {
      fixture = await setup()
      owner = fixture.api
      const result = await owner.auth.signIn(fixture.owner)
      if (result.kind !== 'user') throw new Error('fixture owner could not sign in')
      staff = fixture.otherBrowser()
      await staff.auth.signIn(fixture.staffA)
      today = (await owner.reports.dashboard()).today.dateKey
    })

    const newItem = (overrides: Partial<ItemInput> = {}): ItemInput => ({
      itemId: crypto.randomUUID(),
      name: `Contract item ${crypto.randomUUID().slice(0, 8)}`,
      category: 'Contract',
      unit: 'piece',
      price: 50000,
      costPrice: 30000,
      lowStockLevel: 5,
      openingQuantity: 20,
      ...overrides,
    })

    const quantity = async (itemId: string, api = owner) =>
      (await api.items.list()).find((item) => item.id === itemId)?.quantity

    /** Every item's quantity must equal the sum of its ledger. */
    async function expectLedgerMatches(itemId: string) {
      const { rows } = await owner.stock.movements({ itemId, limit: 100 })
      expect(rows.reduce((sum, move) => sum + move.delta, 0)).toBe(await quantity(itemId))
    }

    const sell = (api: TallyboxApi, itemId: string, qty: number) =>
      api.orders.create({
        clientOrderId: crypto.randomUUID(),
        lines: [{ itemId, quantity: qty }],
        paymentMethod: 'cash',
        paymentReference: '',
        paymentConfirmed: true,
        customerName: '',
        customerPhone: '',
        note: '',
      })

    // --- Items ---------------------------------------------------------------

    it('creates an item with opening stock, recorded in the ledger, with a private cost price', async () => {
      const input = newItem({ name: '  Fresh   Bread ' })
      const item = await owner.items.upsert(input)
      expect(item).toMatchObject({
        name: 'Fresh Bread',
        quantity: 20,
        price: 50000,
        lowStockLevel: 5,
        active: true,
      })
      expect((await owner.items.costs())[item.id]).toBe(30000)

      const { rows } = await owner.stock.movements({ itemId: item.id })
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'opening',
          delta: 20,
          quantityBefore: 0,
          quantityAfter: 20,
        }),
      ])

      // Staff see it on sale, but never the cost.
      expect((await staff.items.list()).some((entry) => entry.id === item.id)).toBe(true)
      expect(await codeOf(staff.items.costs())).toBe('permission_denied')
    })

    it('saves the same new item only once, and editing never changes stock', async () => {
      const input = newItem()
      await owner.items.upsert(input)
      await owner.items.upsert(input)
      expect((await owner.items.list()).filter((item) => item.id === input.itemId)).toHaveLength(1)
      expect(await quantity(input.itemId)).toBe(20)

      const edited = await owner.items.upsert({
        ...input,
        price: 60000,
        costPrice: null,
        lowStockLevel: null,
        openingQuantity: 999,
      })
      expect(edited).toMatchObject({ price: 60000, quantity: 20, lowStockLevel: 5 })
      expect((await owner.items.costs())[input.itemId]).toBeUndefined()
      await expectLedgerMatches(input.itemId)
    })

    it('refuses duplicate names, bad prices and staff', async () => {
      const first = await owner.items.upsert(newItem())
      expect(await codeOf(owner.items.upsert(newItem({ name: first.name.toUpperCase() })))).toBe(
        'item_name_taken',
      )
      expect(await codeOf(owner.items.upsert(newItem({ price: -1 })))).toBe('validation')
      expect(await codeOf(owner.items.upsert(newItem({ price: 10.5 })))).toBe('validation')
      expect(await codeOf(owner.items.upsert(newItem({ name: '  ' })))).toBe('validation')
      expect(await codeOf(staff.items.upsert(newItem()))).toBe('permission_denied')
      expect(await codeOf(staff.items.archive(first.id))).toBe('permission_denied')
    })

    it('archives an item so it cannot be sold, and restores it', async () => {
      const item = await owner.items.upsert(newItem())
      await owner.items.archive(item.id)
      expect((await staff.items.list()).some((entry) => entry.id === item.id)).toBe(false)
      expect((await owner.items.list()).find((entry) => entry.id === item.id)?.active).toBe(false)
      expect(await codeOf(sell(staff, item.id, 1))).toBe('item_unavailable')

      await owner.items.restore(item.id)
      await expect(sell(staff, item.id, 1)).resolves.toMatchObject({ status: 'completed' })
    })

    // --- Restocks and adjustments ------------------------------------------

    it('records a delivery of several items once, however often it is saved', async () => {
      const a = await owner.items.upsert(newItem())
      const b = await owner.items.upsert(newItem({ openingQuantity: 0 }))
      const input = {
        clientId: crypto.randomUUID(),
        receivedOn: today,
        supplier: ' MedSupply ',
        note: 'Invoice 42',
        lines: [
          { itemId: a.id, quantity: 24, unitCost: 28000 },
          { itemId: b.id, quantity: 12, unitCost: null },
        ],
      }
      const first = await owner.stock.restock(input)
      const again = await owner.stock.restock(input)
      expect(again.restockId).toBe(first.restockId)
      expect(await quantity(a.id)).toBe(44)
      expect(await quantity(b.id)).toBe(12)

      const { rows } = await owner.stock.movements({ type: 'restock', itemId: a.id })
      expect(rows).toEqual([
        expect.objectContaining({
          delta: 24,
          supplier: 'MedSupply',
          unitCost: 28000,
          restockId: first.restockId,
        }),
      ])
      await expectLedgerMatches(a.id)
    })

    it('refuses bad deliveries and changes nothing', async () => {
      const item = await owner.items.upsert(newItem())
      const base = { clientId: crypto.randomUUID(), receivedOn: today, supplier: '', note: '' }
      expect(await codeOf(owner.stock.restock({ ...base, lines: [] }))).toBe('validation')
      expect(
        await codeOf(
          owner.stock.restock({
            ...base,
            lines: [
              { itemId: item.id, quantity: 1, unitCost: null },
              { itemId: item.id, quantity: 2, unitCost: null },
            ],
          }),
        ),
      ).toBe('validation')
      expect(
        await codeOf(
          owner.stock.restock({
            ...base,
            lines: [{ itemId: item.id, quantity: 0, unitCost: null }],
          }),
        ),
      ).toBe('validation')
      expect(
        await codeOf(
          owner.stock.restock({
            ...base,
            receivedOn: addDays(today, 2),
            lines: [{ itemId: item.id, quantity: 1, unitCost: null }],
          }),
        ),
      ).toBe('validation')
      await owner.items.archive(item.id)
      expect(
        await codeOf(
          owner.stock.restock({
            ...base,
            lines: [{ itemId: item.id, quantity: 1, unitCost: null }],
          }),
        ),
      ).toBe('item_archived')
      expect(
        await codeOf(
          staff.stock.restock({
            ...base,
            lines: [{ itemId: item.id, quantity: 1, unitCost: null }],
          }),
        ),
      ).toBe('permission_denied')
      expect(await quantity(item.id)).toBe(20)
    })

    it('adjusts stock to a count, with a reason, refusing a stale count', async () => {
      const item = await owner.items.upsert(newItem())
      const adjusted = await owner.stock.adjust({
        itemId: item.id,
        countedQuantity: 17,
        expectedQuantity: 20,
        reason: 'damaged',
        note: ' Three crushed ',
      })
      expect(adjusted.quantity).toBe(17)
      const { rows } = await owner.stock.movements({ itemId: item.id, type: 'adjustment' })
      expect(rows).toEqual([
        expect.objectContaining({ delta: -3, reason: 'damaged', note: 'Three crushed' }),
      ])

      const stale = await errorOf(
        owner.stock.adjust({
          itemId: item.id,
          countedQuantity: 10,
          expectedQuantity: 20,
          reason: 'miscount',
          note: '',
        }),
      )
      expect(stale.code).toBe('conflict')
      expect(stale.details?.quantity).toBe(17)

      const same = { itemId: item.id, expectedQuantity: 17, note: '' }
      expect(
        await codeOf(owner.stock.adjust({ ...same, countedQuantity: 17, reason: 'miscount' })),
      ).toBe('validation')
      expect(
        await codeOf(owner.stock.adjust({ ...same, countedQuantity: 10, reason: 'other' })),
      ).toBe('validation')
      expect(
        await codeOf(owner.stock.adjust({ ...same, countedQuantity: -1, reason: 'miscount' })),
      ).toBe('validation')
      expect(
        await codeOf(staff.stock.adjust({ ...same, countedQuantity: 10, reason: 'miscount' })),
      ).toBe('permission_denied')
      await expectLedgerMatches(item.id)
    })

    // --- Voids and the order list -------------------------------------------

    it('voids an order: stock comes back, the order stays, and only once', async () => {
      const item = await owner.items.upsert(newItem())
      const order = await sell(staff, item.id, 3)
      expect(await quantity(item.id)).toBe(17)

      expect(await codeOf(owner.orders.void({ orderId: order.id, reason: '  ' }))).toBe(
        'validation',
      )
      expect(await codeOf(staff.orders.void({ orderId: order.id, reason: 'Mistake' }))).toBe(
        'permission_denied',
      )

      const voided = await owner.orders.void({ orderId: order.id, reason: 'Customer returned it' })
      expect(voided).toMatchObject({
        status: 'voided',
        voidReason: 'Customer returned it',
        total: order.total,
      })
      expect(voided.voidedByName).toBeTruthy()
      expect(await quantity(item.id)).toBe(20)
      expect(await codeOf(owner.orders.void({ orderId: order.id, reason: 'Again' }))).toBe(
        'conflict',
      )
      await expectLedgerMatches(item.id)
    })

    it('lists orders by date, staff, status, payment method and number', async () => {
      const item = await owner.items.upsert(newItem({ openingQuantity: 50 }))
      const a = await sell(staff, item.id, 1)
      const b = await sell(owner, item.id, 1)
      await owner.orders.void({ orderId: b.id, reason: 'Test' })

      const todays = await owner.orders.list({ from: today, to: today, limit: 100 })
      expect(todays.rows.map((order) => order.id)).toEqual(expect.arrayContaining([a.id, b.id]))
      expect(todays.rows[0]!.createdAt >= todays.rows.at(-1)!.createdAt).toBe(true)

      const staffId = a.staffId
      expect(
        (await owner.orders.list({ from: today, to: today, staffId, limit: 100 })).rows.every(
          (order) => order.staffId === staffId,
        ),
      ).toBe(true)
      expect(
        (
          await owner.orders.list({ from: today, to: today, status: 'voided', limit: 100 })
        ).rows.map((order) => order.id),
      ).toContain(b.id)
      expect(
        (await owner.orders.list({ from: today, to: today, search: `#${a.orderNumber}` })).rows.map(
          (order) => order.id,
        ),
      ).toEqual([a.id])
      expect(
        (await owner.orders.list({ from: addDays(today, 1), to: addDays(today, 2) })).total,
      ).toBe(0)

      const paged = await owner.orders.list({ from: addDays(today, -30), to: today, limit: 2 })
      expect(paged.rows).toHaveLength(2)
      expect(paged.total).toBeGreaterThanOrEqual(2)
      expect(await codeOf(staff.orders.list({ from: today, to: today }))).toBe('permission_denied')
      expect(await codeOf(owner.orders.list({ from: today, to: addDays(today, -1) }))).toBe(
        'validation',
      )
    })

    // --- Dashboard ---------------------------------------------------------

    it("adds up today's sales from completed orders, and counts voids apart", async () => {
      const before = await owner.reports.dashboard()
      const item = await owner.items.upsert(newItem({ price: 10000 }))
      await sell(staff, item.id, 2)
      const voided = await sell(staff, item.id, 1)
      await owner.orders.void({ orderId: voided.id, reason: 'Test' })

      const after = await owner.reports.dashboard()
      expect(after.today.sales - before.today.sales).toBe(20000)
      expect(after.today.orders - before.today.orders).toBe(1)
      expect(after.today.voided - before.today.voided).toBe(1)
      expect(after.today.byPaymentMethod.cash - before.today.byPaymentMethod.cash).toBe(20000)
      expect(after.yesterday.dateKey).toBe(addDays(today, -1))
      expect(await codeOf(staff.reports.dashboard())).toBe('permission_denied')
    })

    it('lists low-stock items, emptiest first', async () => {
      const item = await owner.items.upsert(newItem({ openingQuantity: 1, lowStockLevel: 5 }))
      const { lowStock } = await owner.reports.dashboard()
      expect(lowStock.map((entry) => entry.id)).toContain(item.id)
      const quantities = lowStock.map((entry) => entry.quantity)
      expect(quantities).toEqual([...quantities].sort((x, y) => x - y))
    })

    // --- Staff accounts ----------------------------------------------------

    it('resets a staff password and turns an account off and on', async () => {
      const member = await owner.staff.create({
        displayName: 'Temp Worker',
        username: 'temp',
        password: 'first-pass-1',
      })
      await owner.staff.resetPassword({ staffId: member.id, newPassword: 'second-pass-2' })
      expect(
        await codeOf(owner.staff.resetPassword({ staffId: member.id, newPassword: 'short' })),
      ).toBe('weak_password')

      const login = fixture.otherBrowser()
      const staffLogin = { ...fixture.staffA, username: 'temp' }
      expect(await codeOf(login.auth.signIn({ ...staffLogin, password: 'first-pass-1' }))).toBe(
        'invalid_credentials',
      )
      expect((await login.auth.signIn({ ...staffLogin, password: 'second-pass-2' })).kind).toBe(
        'user',
      )

      expect(await owner.staff.setActive({ staffId: member.id, active: false })).toMatchObject({
        active: false,
      })
      expect(await login.auth.getSession()).toMatchObject({
        kind: 'blocked',
        notice: { reason: 'disabled' },
      })
      expect(await login.auth.signIn({ ...staffLogin, password: 'second-pass-2' })).toMatchObject({
        kind: 'blocked',
      })

      await owner.staff.setActive({ staffId: member.id, active: true })
      expect((await login.auth.signIn({ ...staffLogin, password: 'second-pass-2' })).kind).toBe(
        'user',
      )
      expect(await codeOf(staff.staff.setActive({ staffId: member.id, active: false }))).toBe(
        'permission_denied',
      )
    })

    // --- Business settings --------------------------------------------------

    it('lets the owner change settings, which everyone in the business then sees', async () => {
      const current = await owner.business.get()
      const updated = await owner.business.update({
        name: ' Sunrise  Chemists ',
        currencyCode: 'ghs',
        timezone: 'Africa/Accra',
        address: '1 New Road',
        phone: '0800 000 0000',
        receiptFooter: 'Thanks!',
        defaultLowStockLevel: 7,
      })
      expect(updated).toMatchObject({
        name: 'Sunrise Chemists',
        currencyCode: 'GHS',
        timezone: 'Africa/Accra',
        receiptFooter: 'Thanks!',
        defaultLowStockLevel: 7,
        businessCode: current.businessCode,
        logoUrl: current.logoUrl,
      })
      expect(await staff.business.get()).toMatchObject({ name: 'Sunrise Chemists' })
      expect(await owner.auth.getSession()).toMatchObject({
        user: { businessName: 'Sunrise Chemists', currencyCode: 'GHS', timezone: 'Africa/Accra' },
      })

      const settings = {
        name: 'Sunrise Chemists',
        currencyCode: 'GHS',
        timezone: 'Africa/Accra',
        address: '',
        phone: '',
        receiptFooter: '',
        defaultLowStockLevel: 7,
      }
      expect(await codeOf(owner.business.update({ ...settings, currencyCode: 'XYZW' }))).toBe(
        'validation',
      )
      expect(await codeOf(owner.business.update({ ...settings, timezone: 'Mars/Olympus' }))).toBe(
        'validation',
      )
      expect(await codeOf(owner.business.update({ ...settings, logo: 'not-an-image' }))).toBe(
        'validation',
      )
      expect(await codeOf(staff.business.update(settings))).toBe('permission_denied')

      const tinyPng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=='
      expect((await owner.business.update({ ...settings, logo: tinyPng })).logoUrl).toBe(tinyPng)
      expect((await owner.business.update(settings)).logoUrl).toBe(tinyPng)
      expect((await owner.business.update({ ...settings, logo: null })).logoUrl).toBeNull()
    })
  })
}
