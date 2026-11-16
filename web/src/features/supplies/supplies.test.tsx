import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TallyboxApi } from '@/api/types'
import { createTestApi, DEMO } from '@/test/mockApi'
import { renderApp } from '@/test/render'

/** Shared supplies on the screens, with the Green Leaf Restaurant demo (drinks share bottles and caps). */

const GREEN_LEAF_OWNER = {
  portal: 'owner' as const,
  email: 'greenleaf@demo.tallybox.test',
  password: DEMO.password,
}
const GREEN_LEAF_STAFF = { ...DEMO.staff, businessCode: 'green-leaf', username: 'tobi' }

async function greenLeaf() {
  const test = createTestApi()
  const owner = test.api
  await owner.auth.signIn(GREEN_LEAF_OWNER)
  const staff = test.otherBrowser()
  await staff.auth.signIn(GREEN_LEAF_STAFF)
  return { test, owner, staff }
}

async function supplyNamed(api: TallyboxApi, name: string) {
  const supply = (await api.supplies.list()).find((candidate) => candidate.name === name)
  if (!supply) throw new Error(`no supply ${name}`)
  return supply
}

/** Leaves only `count` of a supply, as a stock count would. */
async function leave(api: TallyboxApi, name: string, count: number) {
  const supply = await supplyNamed(api, name)
  await api.stock.adjust({
    supplyId: supply.id,
    countedQuantity: count,
    expectedQuantity: supply.quantity,
    reason: 'miscount',
    note: '',
  })
}

describe('selling items that share supplies', () => {
  it('shows how many can be sold, and counts the cart against the shared supply', async () => {
    const { owner, staff } = await greenLeaf()
    await leave(owner, '300 ml bottle', 5)
    renderApp({ path: '/staff/new-order', api: staff })

    const coke = await screen.findByRole('button', { name: /^Add Coke 300ml/ })
    expect(coke).toHaveTextContent('Low: 5 left')
    // Food made to order isn't counted at all.
    expect(screen.getByRole('button', { name: /^Add Jollof rice/ })).toHaveTextContent(
      'No stock count',
    )

    await userEvent.click(coke)
    await userEvent.click(coke)
    await userEvent.click(coke)
    // Three of the five bottles are in the cart, so only two Fanta fit.
    const fanta = screen.getByRole('button', { name: /^Add Fanta 300ml/ })
    await waitFor(() => expect(fanta).toHaveTextContent('Low: 2 left'))
    await userEvent.click(fanta)
    await userEvent.click(fanta)
    await waitFor(() => expect(fanta).toBeDisabled())
    // Every drink is now blocked: the bottles are all spoken for.
    expect(screen.getByRole('button', { name: /^Add Zobo 300ml/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Add Jollof rice/ })).toBeEnabled()
  })

  it('names the supply and the items sharing it when stock ran short meanwhile', async () => {
    const { owner, staff } = await greenLeaf()
    renderApp({ path: '/staff/new-order', api: staff })
    await userEvent.click(await screen.findByRole('button', { name: /^Add Coke 300ml/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Add Coke 300ml/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Add Fanta 300ml/ }))

    // Meanwhile a stock count finds only two bottles.
    await leave(owner, '300 ml bottle', 2)

    await userEvent.click(screen.getByRole('button', { name: /View cart/ }))
    const cart = await screen.findByRole('dialog', { name: 'Cart' })
    await userEvent.click(within(cart).getByRole('radio', { name: 'Cash' }))
    await userEvent.click(within(cart).getByRole('checkbox', { name: /Payment received/ }))
    await userEvent.click(within(cart).getByRole('button', { name: 'Confirm order' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm order' }),
    )

    expect(
      await screen.findByText(
        /Not enough 300 ml bottle: 3 needed, 2 left\. Coke 300ml and Fanta 300ml use it\./,
      ),
    ).toBeInTheDocument()
    // Nothing was taken.
    expect((await supplyNamed(owner, '300 ml bottle')).quantity).toBe(2)
  })

  it("shows staff what can be sold on Items, never a supply's cost", async () => {
    const { staff } = await greenLeaf()
    renderApp({ path: '/staff/items', api: staff })
    // A list row: the title's text sits two levels inside it.
    const row = (name: string) => screen.getByText(name).parentElement!.parentElement!
    await screen.findByText('Coke 300ml')
    expect(row('Coke 300ml')).toHaveTextContent(/\d+ can be sold/)
    expect(row('Jollof rice')).toHaveTextContent('No stock count')
    expect(row('Grilled chicken')).toHaveTextContent(/\d+ in stock/)
  })
})

describe('supplies for the owner', () => {
  it('lists supplies with what uses them, and adds a new one', async () => {
    const { owner } = await greenLeaf()
    renderApp({ path: '/owner/supplies', api: owner })
    const bottle = await screen.findByRole('link', { name: /300 ml bottle/ })
    expect(bottle).toHaveTextContent(
      'Used by Apple juice 300ml, Coke 300ml, Fanta 300ml and Zobo 300ml',
    )

    await userEvent.click(screen.getByRole('link', { name: 'Add supply' }))
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Takeaway pack')
    await userEvent.type(screen.getByLabelText(/^Unit/), 'pack')
    await userEvent.type(screen.getByLabelText(/^Opening quantity/), '200')
    await userEvent.click(screen.getByRole('button', { name: 'Add supply' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Takeaway pack' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('+200')).toBeInTheDocument()
    expect(screen.getByText(/No item uses it yet/)).toBeInTheDocument()
  })

  it("shows a supply's history with the item each sale was for, and refuses to archive it while in use", async () => {
    const { owner } = await greenLeaf()
    const bottle = await supplyNamed(owner, '300 ml bottle')
    renderApp({ path: `/owner/supplies/${bottle.id}`, api: owner })

    expect(await screen.findByText(/for Coke 300ml · order #0001/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Apple juice 300ml/ })).toHaveTextContent(
      'Uses 1 per sale',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Items on sale still use it')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText('Items still use this supply')).toBeInTheDocument()
    expect((await supplyNamed(owner, '300 ml bottle')).active).toBe(true)
  })

  it('sets an item to use shared supplies only, and records the change', async () => {
    const { owner } = await greenLeaf()
    const chicken = (await owner.items.list()).find((item) => item.name === 'Grilled chicken')!
    renderApp({ path: `/owner/items/${chicken.id}/edit`, api: owner })

    const own = await screen.findByRole('checkbox', { name: /Count this item's own stock/ })
    expect(own).toBeChecked()
    await userEvent.click(own)
    await userEvent.click(screen.getByRole('checkbox', { name: /Use shared supplies/ }))
    // A supply must be chosen before it can be saved.
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Choose a supply.')).toBeInTheDocument()

    const cap = await supplyNamed(owner, 'Bottle cap')
    await userEvent.selectOptions(screen.getByLabelText('Supply 1'), cap.id)
    const units = screen.getByLabelText('Used per sale')
    await userEvent.clear(units)
    await userEvent.type(units, '2')
    expect(screen.getByText(/This changes new sales only/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Shared supplies', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bottle cap' })).toBeInTheDocument()
    expect(
      await screen.findByText(/Own stock → Shared supplies: 2 × Bottle cap/),
    ).toBeInTheDocument()
    // Its own stock can no longer be restocked or adjusted.
    expect(screen.queryByRole('link', { name: 'Adjust' })).not.toBeInTheDocument()
    expect((await owner.items.list()).find((item) => item.id === chicken.id)).toMatchObject({
      tracksOwnStock: false,
      available: Math.floor(cap.quantity / 2),
    })
  })

  it('restocks a supply in a delivery, and every drink can sell more', async () => {
    const { owner } = await greenLeaf()
    const bottle = await supplyNamed(owner, '300 ml bottle')
    renderApp({ path: `/owner/restock?supply=${bottle.id}`, api: owner })
    await userEvent.type(await screen.findByLabelText(/^Quantity received/), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Save delivery' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
    expect((await supplyNamed(owner, '300 ml bottle')).quantity).toBe(bottle.quantity + 500)
  })

  it('shows low supplies on the dashboard and supplies used in reports', async () => {
    const { owner } = await greenLeaf()
    await leave(owner, 'Bottle cap', 40)
    const view = renderApp({ path: '/owner/dashboard', api: owner })
    const cap = await screen.findByRole('link', { name: /Bottle cap/ })
    expect(cap).toHaveTextContent('Shared supply')
    expect(cap).toHaveTextContent('40 left')
    view.unmount()

    renderApp({ path: '/owner/reports', api: owner })
    const supplies = await screen.findByRole('list', { name: 'Shared supplies' })
    expect(within(supplies).getByText('300 ml bottle')).toBeInTheDocument()
    expect(within(supplies).getAllByText(/used · \d+ left now/).length).toBe(2)
    expect(
      within(supplies).getByRole('list', { name: '300 ml bottle used by item' }),
    ).toHaveTextContent('Coke 300ml')
  })
})
