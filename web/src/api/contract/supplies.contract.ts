import { beforeEach, describe, expect, it } from 'vitest'
import type { SupplyProblem } from '@/domain/supplies'
import { AppError, type AppErrorCode } from '@/lib/errors'
import type { ItemInput, SupplyInput, TallyboxApi } from '../types'
import type { ShopFixture } from './orders.contract'

/**
 * The contract for shared supplies: stock counted by packaging or materials,
 * like 300 ml bottles used by several drinks. An item can count its own stock,
 * use shared supplies, both, or neither.
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

export function describeSuppliesContract(name: string, setup: () => Promise<ShopFixture>) {
  describe(`TallyboxApi contract: shared supplies (${name})`, () => {
    let owner: TallyboxApi
    let staff: TallyboxApi
    let today: string

    beforeEach(async () => {
      const fixture = await setup()
      owner = fixture.api
      const result = await owner.auth.signIn(fixture.owner)
      if (result.kind !== 'user') throw new Error('fixture owner could not sign in')
      staff = fixture.otherBrowser()
      await staff.auth.signIn(fixture.staffA)
      today = (await owner.reports.dashboard()).today.dateKey
    })

    const tag = () => crypto.randomUUID().slice(0, 8)

    const newSupply = (overrides: Partial<SupplyInput> = {}): SupplyInput => ({
      supplyId: crypto.randomUUID(),
      name: `Bottle ${tag()}`,
      unit: 'bottle',
      costPrice: 6000,
      lowStockLevel: 100,
      openingQuantity: 1000,
      ...overrides,
    })

    const newItem = (overrides: Partial<ItemInput> = {}): ItemInput => ({
      itemId: crypto.randomUUID(),
      name: `Drink ${tag()}`,
      category: 'Drinks',
      unit: '',
      price: 50000,
      costPrice: null,
      lowStockLevel: 5,
      openingQuantity: 0,
      tracksOwnStock: false,
      supplies: [],
      ...overrides,
    })

    const sell = (api: TallyboxApi, lines: { itemId: string; quantity: number }[]) =>
      api.orders.create({
        clientOrderId: crypto.randomUUID(),
        lines,
        paymentMethod: 'cash',
        paymentReference: '',
        paymentConfirmed: true,
        customerName: '',
        customerPhone: '',
        note: '',
      })

    const supplyNow = async (supplyId: string, api = owner) =>
      (await api.supplies.list()).find((supply) => supply.id === supplyId)
    const itemNow = async (itemId: string, api = owner) =>
      (await api.items.list()).find((item) => item.id === itemId)

    /** A supply's quantity must always equal the sum of its ledger, and never go below zero. */
    async function expectSupplyLedgerMatches(supplyId: string) {
      const { rows, total } = await owner.stock.movements({ supplyId, limit: 200 })
      expect(total).toBe(rows.length)
      const quantity = (await supplyNow(supplyId))?.quantity
      expect(rows.reduce((sum, move) => sum + move.delta, 0)).toBe(quantity)
      expect(rows.every((move) => move.quantityAfter >= 0)).toBe(true)
    }

    /** The brief's drinks: three drinks sharing bottles; apple juice also counts its own 800. */
    async function drinksShop() {
      const bottle = await owner.supplies.upsert(newSupply())
      const use = [{ supplyId: bottle.id, unitsPerSale: 1 }]
      const coke = await owner.items.upsert(newItem({ supplies: use }))
      const fanta = await owner.items.upsert(newItem({ supplies: use }))
      const apple = await owner.items.upsert(
        newItem({ supplies: use, tracksOwnStock: true, openingQuantity: 800 }),
      )
      return { bottle, coke, fanta, apple }
    }

    // --- Supplies themselves -------------------------------------------------

    it('creates a supply with an opening count in the ledger, and a cost only the owner sees', async () => {
      const input = newSupply({ name: '  300 ml   bottle x ' })
      const supply = await owner.supplies.upsert(input)
      expect(supply).toMatchObject({
        id: input.supplyId,
        name: '300 ml bottle x',
        unit: 'bottle',
        quantity: 1000,
        lowStockLevel: 100,
        active: true,
        usedBy: [],
      })
      expect((await owner.supplies.costs())[supply.id]).toBe(6000)
      const { rows } = await owner.stock.movements({ supplyId: supply.id })
      expect(rows).toEqual([
        expect.objectContaining({
          type: 'opening',
          delta: 1000,
          quantityBefore: 0,
          quantityAfter: 1000,
          supplyId: supply.id,
          itemId: null,
        }),
      ])

      // Staff see the supply (to know what can be sold) but never its cost.
      expect((await supplyNow(supply.id, staff))?.quantity).toBe(1000)
      expect(Object.keys((await supplyNow(supply.id, staff)) ?? {})).not.toContain('costPrice')
      expect(await codeOf(staff.supplies.costs())).toBe('permission_denied')
    })

    it('saves the same new supply only once, refuses duplicate names, and keeps staff out', async () => {
      const input = newSupply()
      await owner.supplies.upsert(input)
      const again = await owner.supplies.upsert({ ...input, name: `${input.name} v2` })
      expect(again.quantity).toBe(1000)
      expect((await owner.stock.movements({ supplyId: input.supplyId })).total).toBe(1)

      expect(
        await codeOf(owner.supplies.upsert(newSupply({ name: again.name.toUpperCase() }))),
      ).toBe('supply_name_taken')
      expect(await codeOf(owner.supplies.upsert(newSupply({ name: ' ' })))).toBe('validation')
      expect(await codeOf(owner.supplies.upsert(newSupply({ openingQuantity: -1 })))).toBe(
        'validation',
      )
      expect(await codeOf(staff.supplies.upsert(newSupply()))).toBe('permission_denied')
      expect(await codeOf(staff.supplies.archive(input.supplyId))).toBe('permission_denied')
    })

    // --- Selling ---------------------------------------------------------------

    it('deducts nothing when items and supplies are created or given opening counts', async () => {
      const { bottle, apple } = await drinksShop()
      expect((await supplyNow(bottle.id))?.quantity).toBe(1000)
      expect((await itemNow(apple.id))?.quantity).toBe(800)
      expect((await owner.stock.movements({ supplyId: bottle.id })).total).toBe(1)
    })

    it('adds up every line: 10 Coke + 10 apple juice + 10 Fanta use 30 bottles', async () => {
      const { bottle, coke, fanta, apple } = await drinksShop()
      const order = await sell(staff, [
        { itemId: coke.id, quantity: 10 },
        { itemId: apple.id, quantity: 10 },
        { itemId: fanta.id, quantity: 10 },
      ])

      expect((await supplyNow(bottle.id))?.quantity).toBe(970)
      // "Both": apple juice's own stock goes down too.
      expect((await itemNow(apple.id))?.quantity).toBe(790)

      // Each deduction is its own ledger entry, linked to the order and to its item.
      const { rows } = await owner.stock.movements({ supplyId: bottle.id, type: 'sale' })
      expect(rows).toHaveLength(3)
      expect(rows.every((move) => move.orderId === order.id && move.delta === -10)).toBe(true)
      expect(rows.map((move) => move.sourceItemId).sort()).toEqual(
        [coke.id, fanta.id, apple.id].sort(),
      )
      // Items that don't count their own stock have no ledger entries of their own.
      expect((await owner.stock.movements({ itemId: coke.id })).total).toBe(0)
      await expectSupplyLedgerMatches(bottle.id)
    })

    it('shows how many can be sold: the lowest of own stock and each supply ÷ units per sale', async () => {
      const bottle = await owner.supplies.upsert(newSupply({ openingQuantity: 25 }))
      const cap = await owner.supplies.upsert(newSupply({ openingQuantity: 7 }))
      const single = await owner.items.upsert(
        newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }] }),
      )
      const crate = await owner.items.upsert(
        newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 12 }] }),
      )
      const capped = await owner.items.upsert(
        newItem({
          supplies: [
            { supplyId: bottle.id, unitsPerSale: 1 },
            { supplyId: cap.id, unitsPerSale: 1 },
          ],
        }),
      )
      const both = await owner.items.upsert(
        newItem({
          tracksOwnStock: true,
          openingQuantity: 3,
          supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }],
        }),
      )
      const neither = await owner.items.upsert(newItem())

      expect(single.available).toBe(25)
      expect(crate.available).toBe(2)
      expect(capped.available).toBe(7)
      expect(both.available).toBe(3)
      expect(neither.available).toBeNull()
      // Staff see the same numbers, and which supplies an item uses.
      const seen = await itemNow(capped.id, staff)
      expect(seen?.available).toBe(7)
      expect(seen?.supplies.map((use) => use.supplyId).sort()).toEqual([bottle.id, cap.id].sort())
    })

    it('refuses an order that needs more of a supply than is left, naming who shares it', async () => {
      const bottle = await owner.supplies.upsert(newSupply({ openingQuantity: 15 }))
      const use = [{ supplyId: bottle.id, unitsPerSale: 1 }]
      const coke = await owner.items.upsert(newItem({ supplies: use }))
      const fanta = await owner.items.upsert(newItem({ supplies: use }))

      // Each line alone would fit; together they need 20 of 15.
      const error = await errorOf(
        sell(staff, [
          { itemId: coke.id, quantity: 10 },
          { itemId: fanta.id, quantity: 10 },
        ]),
      )
      expect(error.code).toBe('insufficient_stock')
      const problems = error.details?.supplyProblems as SupplyProblem[]
      expect(problems).toEqual([
        expect.objectContaining({ supplyId: bottle.id, needed: 20, available: 15 }),
      ])
      expect(problems[0]?.itemNames.sort()).toEqual([coke.name, fanta.name].sort())
      expect(error.details?.problems).toEqual([])

      // Nothing changed, and exactly what is left can still be sold: never below zero.
      expect((await supplyNow(bottle.id))?.quantity).toBe(15)
      await sell(staff, [
        { itemId: coke.id, quantity: 10 },
        { itemId: fanta.id, quantity: 5 },
      ])
      expect((await supplyNow(bottle.id))?.quantity).toBe(0)
      expect(await codeOf(sell(staff, [{ itemId: coke.id, quantity: 1 }]))).toBe(
        'insufficient_stock',
      )
      await expectSupplyLedgerMatches(bottle.id)
    })

    it("says when it is the item's own stock that is short, not the supply", async () => {
      const bottle = await owner.supplies.upsert(newSupply())
      const juice = await owner.items.upsert(
        newItem({
          tracksOwnStock: true,
          openingQuantity: 3,
          supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }],
        }),
      )
      const error = await errorOf(sell(staff, [{ itemId: juice.id, quantity: 4 }]))
      expect(error.code).toBe('insufficient_stock')
      expect(error.details?.problems).toEqual([
        expect.objectContaining({ itemId: juice.id, available: 3, requested: 4 }),
      ])
      expect(error.details?.supplyProblems).toEqual([])
    })

    it('sells items that count nothing without any stock check or ledger entry', async () => {
      const rice = await owner.items.upsert(newItem())
      await sell(staff, [{ itemId: rice.id, quantity: 500 }])
      expect((await itemNow(rice.id))?.available).toBeNull()
      expect((await owner.stock.movements({ itemId: rice.id })).total).toBe(0)
    })

    // --- Voids -----------------------------------------------------------------

    it("voiding puts back both the item's own stock and the supplies it used", async () => {
      const { bottle, coke, apple } = await drinksShop()
      const order = await sell(staff, [
        { itemId: apple.id, quantity: 10 },
        { itemId: coke.id, quantity: 5 },
      ])
      expect((await supplyNow(bottle.id))?.quantity).toBe(985)

      await owner.orders.void({ orderId: order.id, reason: 'Contract' })
      expect((await supplyNow(bottle.id))?.quantity).toBe(1000)
      expect((await itemNow(apple.id))?.quantity).toBe(800)
      const { rows } = await owner.stock.movements({ supplyId: bottle.id, type: 'void' })
      expect(rows.map((move) => move.delta).sort()).toEqual([10, 5].sort())
      expect(rows.every((move) => move.orderId === order.id)).toBe(true)
      await expectSupplyLedgerMatches(bottle.id)
    })

    it("a void reverses the order's own entries, even after the item's usage changed", async () => {
      const bottle = await owner.supplies.upsert(newSupply())
      const cap = await owner.supplies.upsert(newSupply())
      const input = newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }] })
      const drink = await owner.items.upsert(input)
      const order = await sell(staff, [{ itemId: drink.id, quantity: 10 }])

      // Later the owner changes what the drink uses: two bottles and a cap.
      await owner.items.upsert({
        ...input,
        supplies: [
          { supplyId: bottle.id, unitsPerSale: 2 },
          { supplyId: cap.id, unitsPerSale: 1 },
        ],
      })
      await owner.orders.void({ orderId: order.id, reason: 'Contract' })

      // Exactly the 10 bottles that order took come back; caps were never used.
      expect((await supplyNow(bottle.id))?.quantity).toBe(1000)
      expect((await supplyNow(cap.id))?.quantity).toBe(1000)
      // New sales use the new amounts.
      await sell(staff, [{ itemId: drink.id, quantity: 3 }])
      expect((await supplyNow(bottle.id))?.quantity).toBe(994)
      expect((await supplyNow(cap.id))?.quantity).toBe(997)
      await expectSupplyLedgerMatches(bottle.id)
      await expectSupplyLedgerMatches(cap.id)
    })

    // --- Changing how an item counts stock ---------------------------------------

    it('records every change to how an item counts stock, and only the owner can make one', async () => {
      const bottle = await owner.supplies.upsert(newSupply())
      const input = newItem({ tracksOwnStock: true, openingQuantity: 12 })
      const item = await owner.items.upsert(input)
      expect(await owner.items.stockModeChanges(item.id)).toEqual([])

      // Saving without changing the mode records nothing.
      await owner.items.upsert({ ...input, price: 60000 })
      expect(await owner.items.stockModeChanges(item.id)).toEqual([])

      const changed = await owner.items.upsert({
        ...input,
        tracksOwnStock: false,
        supplies: [{ supplyId: bottle.id, unitsPerSale: 2 }],
      })
      expect(changed).toMatchObject({ tracksOwnStock: false, available: 500 })
      expect(changed.supplies).toEqual([
        expect.objectContaining({ supplyId: bottle.id, name: bottle.name, unitsPerSale: 2 }),
      ])
      const changes = await owner.items.stockModeChanges(item.id)
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        before: { tracksOwnStock: true, supplies: [] },
        after: {
          tracksOwnStock: false,
          supplies: [expect.objectContaining({ supplyId: bottle.id, unitsPerSale: 2 })],
        },
      })
      expect((await supplyNow(bottle.id))?.usedBy).toEqual([
        { itemId: item.id, name: item.name, unitsPerSale: 2 },
      ])

      expect(await codeOf(staff.items.upsert({ ...input, tracksOwnStock: false }))).toBe(
        'permission_denied',
      )
      expect(await codeOf(staff.items.stockModeChanges(item.id))).toBe('permission_denied')
    })

    it('refuses bad supply settings on an item', async () => {
      const bottle = await owner.supplies.upsert(newSupply())
      const use = (unitsPerSale: number) => [{ supplyId: bottle.id, unitsPerSale }]
      expect(await codeOf(owner.items.upsert(newItem({ supplies: use(0) })))).toBe('validation')
      expect(await codeOf(owner.items.upsert(newItem({ supplies: use(1.5) })))).toBe('validation')
      expect(await codeOf(owner.items.upsert(newItem({ supplies: [...use(1), ...use(2)] })))).toBe(
        'validation',
      )
      expect(
        await codeOf(
          owner.items.upsert(
            newItem({ supplies: [{ supplyId: 'no-such-supply', unitsPerSale: 1 }] }),
          ),
        ),
      ).toBe('not_found')
      // An opening count needs the item to count its own stock.
      expect(await codeOf(owner.items.upsert(newItem({ openingQuantity: 5 })))).toBe('validation')
    })

    // --- Restock, adjust, archive ------------------------------------------------

    it('restocks and adjusts supplies like items, in the same permanent ledger', async () => {
      const bottle = await owner.supplies.upsert(newSupply({ openingQuantity: 100 }))
      const drink = await owner.items.upsert(
        newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }] }),
      )
      await owner.stock.restock({
        clientId: crypto.randomUUID(),
        receivedOn: today,
        supplier: 'Glassworks',
        note: '',
        lines: [{ supplyId: bottle.id, quantity: 500, unitCost: 5500 }],
      })
      expect((await supplyNow(bottle.id))?.quantity).toBe(600)

      expect(
        await owner.stock.adjust({
          supplyId: bottle.id,
          countedQuantity: 590,
          expectedQuantity: 600,
          reason: 'damaged',
          note: 'Broken in the store',
        }),
      ).toEqual({ quantity: 590 })
      const stale = await errorOf(
        owner.stock.adjust({
          supplyId: bottle.id,
          countedQuantity: 1,
          expectedQuantity: 600,
          reason: 'miscount',
          note: '',
        }),
      )
      expect(stale.code).toBe('conflict')
      expect(stale.details?.quantity).toBe(590)
      await expectSupplyLedgerMatches(bottle.id)

      // An item whose own stock isn't counted is restocked through its supplies.
      const line = { itemId: drink.id, quantity: 5, unitCost: null }
      expect(
        await codeOf(
          owner.stock.restock({
            clientId: crypto.randomUUID(),
            receivedOn: today,
            supplier: '',
            note: '',
            lines: [line],
          }),
        ),
      ).toBe('stock_not_counted')
      expect(
        await codeOf(
          owner.stock.adjust({
            itemId: drink.id,
            countedQuantity: 5,
            expectedQuantity: 0,
            reason: 'miscount',
            note: '',
          }),
        ),
      ).toBe('stock_not_counted')
      expect(
        await codeOf(
          staff.stock.adjust({
            supplyId: bottle.id,
            countedQuantity: 1,
            expectedQuantity: 590,
            reason: 'miscount',
            note: '',
          }),
        ),
      ).toBe('permission_denied')
    })

    it('lets the owner count archived stock, but never restock it', async () => {
      const supply = await owner.supplies.upsert(newSupply({ openingQuantity: 40 }))
      await owner.supplies.archive(supply.id)
      // Leftover stock of something no longer used can be counted down to zero.
      expect(
        await owner.stock.adjust({
          supplyId: supply.id,
          countedQuantity: 0,
          expectedQuantity: 40,
          reason: 'expired',
          note: '',
        }),
      ).toEqual({ quantity: 0 })
      expect(
        await codeOf(
          owner.stock.restock({
            clientId: crypto.randomUUID(),
            receivedOn: today,
            supplier: '',
            note: '',
            lines: [{ supplyId: supply.id, quantity: 5, unitCost: null }],
          }),
        ),
      ).toBe('item_archived')

      const item = await owner.items.upsert(newItem({ tracksOwnStock: true, openingQuantity: 6 }))
      await owner.items.archive(item.id)
      expect(
        await owner.stock.adjust({
          itemId: item.id,
          countedQuantity: 0,
          expectedQuantity: 6,
          reason: 'damaged',
          note: '',
        }),
      ).toEqual({ quantity: 0 })
      await expectSupplyLedgerMatches(supply.id)
    })

    it('never archives a supply that items on sale still use', async () => {
      const bottle = await owner.supplies.upsert(newSupply())
      const input = newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }] })
      await owner.items.upsert(input)
      expect(await codeOf(owner.supplies.archive(bottle.id))).toBe('supply_in_use')

      await owner.items.upsert({ ...input, supplies: [] })
      await owner.supplies.archive(bottle.id)
      expect((await supplyNow(bottle.id))?.active).toBe(false)
      // Archived: hidden from staff, and it can't be chosen on an item.
      expect(await supplyNow(bottle.id, staff)).toBeUndefined()
      expect(
        await codeOf(
          owner.items.upsert(newItem({ supplies: [{ supplyId: bottle.id, unitsPerSale: 1 }] })),
        ),
      ).toBe('item_archived')
      await owner.supplies.restore(bottle.id)
      expect((await supplyNow(bottle.id, staff))?.active).toBe(true)
    })

    // --- Dashboard and reports -----------------------------------------------------

    it('lists low supplies on the dashboard, and reports supplies used by item', async () => {
      const bottle = await owner.supplies.upsert(
        newSupply({ openingQuantity: 40, lowStockLevel: 30 }),
      )
      const use = [{ supplyId: bottle.id, unitsPerSale: 1 }]
      const coke = await owner.items.upsert(newItem({ supplies: use }))
      const fanta = await owner.items.upsert(newItem({ supplies: use }))
      expect(
        (await owner.reports.dashboard()).lowSupplies.some((supply) => supply.id === bottle.id),
      ).toBe(false)

      await sell(staff, [
        { itemId: coke.id, quantity: 8 },
        { itemId: fanta.id, quantity: 4 },
      ])
      const voided = await sell(staff, [{ itemId: coke.id, quantity: 3 }])
      await owner.orders.void({ orderId: voided.id, reason: 'Contract' })

      const low = (await owner.reports.dashboard()).lowSupplies
      expect(low.find((supply) => supply.id === bottle.id)?.quantity).toBe(28)

      // The voided order used nothing.
      const report = await owner.reports.summary({ from: today, to: today })
      expect(report.supplies.find((supply) => supply.supplyId === bottle.id)).toEqual({
        supplyId: bottle.id,
        name: bottle.name,
        unit: 'bottle',
        used: 12,
        remaining: 28,
        byItem: [
          { itemId: coke.id, name: coke.name, used: 8 },
          { itemId: fanta.id, name: fanta.name, used: 4 },
        ],
      })
      expect(report.stockValue?.suppliesAtCost).toBeGreaterThanOrEqual(28 * 6000)
      expect(await codeOf(staff.reports.summary({ from: today, to: today }))).toBe(
        'permission_denied',
      )
    })
  })
}
