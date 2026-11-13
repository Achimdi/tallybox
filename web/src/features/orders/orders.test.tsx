import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TallyboxApi } from '@/api/types'
import { DEMO, signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

/** Opens a staff screen as demo staff member Ada, on fresh demo data. */
async function asStaff(path: string) {
  const test = await signedInTestApi('staff')
  const view = renderApp({ path, api: test.api })
  return { ...view, test }
}

async function quantityOf(api: TallyboxApi, name: string) {
  return (await api.items.list()).find((item) => item.name === name)?.quantity
}

async function addItem(name: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name }))
}

async function openCart() {
  await userEvent.click(screen.getByRole('button', { name: /View cart/ }))
  return screen.findByRole('dialog', { name: 'Cart' })
}

describe('new order', () => {
  it('takes an order end to end, and stock goes down', async () => {
    const { test, router } = await asStaff('/staff/new-order')
    const before = await quantityOf(test.api, 'Bottled water 75cl')

    await addItem(/Add Bottled water 75cl/)
    await addItem(/Add Bottled water 75cl/)
    await addItem(/Add Paracetamol/)
    expect(screen.getByRole('button', { name: /View cart/ })).toHaveTextContent('3 items')

    const cart = await openCart()
    const confirm = within(cart).getByRole('button', { name: 'Confirm order' })
    expect(confirm).toBeDisabled()

    await userEvent.click(within(cart).getByRole('radio', { name: 'Bank transfer' }))
    await userEvent.type(within(cart).getByLabelText('Transfer reference'), 'TRF-555')
    expect(confirm).toBeDisabled()
    await userEvent.click(within(cart).getByRole('checkbox', { name: /Payment received/ }))
    expect(confirm).toBeEnabled()

    await userEvent.click(confirm)
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirm this order?' })
    expect(dialog).toHaveTextContent('₦950.00 paid by bank transfer')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    expect(
      await screen.findByRole('heading', { name: /Order #\d{4} confirmed/ }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/staff\/orders\/.+\/done$/)
    expect(screen.getByText('₦950.00')).toBeInTheDocument()
    expect(await quantityOf(test.api, 'Bottled water 75cl')).toBe((before ?? 0) - 2)

    // A fresh, empty cart for the next customer.
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'New order' }))
    await screen.findByRole('heading', { name: 'New order' })
    expect(screen.queryByRole('button', { name: /View cart/ })).not.toBeInTheDocument()
  })

  it('asks for the payment tick again whenever the cart changes', async () => {
    await asStaff('/staff/new-order')
    await addItem(/Add Biscuits/)
    const cart = await openCart()
    await userEvent.click(within(cart).getByRole('radio', { name: 'Cash' }))
    const tick = within(cart).getByRole('checkbox', { name: /Payment received/ })
    await userEvent.click(tick)
    expect(tick).toBeChecked()

    await userEvent.click(within(cart).getByRole('button', { name: 'Increase' }))
    expect(tick).not.toBeChecked()
    expect(within(cart).getByRole('button', { name: 'Confirm order' })).toBeDisabled()
  })

  it('cannot add an out-of-stock item, and flags low stock', async () => {
    await asStaff('/staff/new-order')
    expect(await screen.findByRole('button', { name: 'Add Malaria test kit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Add Vitamin C/ })).toHaveTextContent('Low: 3 left')
  })

  it('finds items by search and category', async () => {
    await asStaff('/staff/new-order')
    await screen.findByRole('button', { name: /Add Biscuits/ })
    await userEvent.click(screen.getByRole('radio', { name: 'Baby' }))
    expect(screen.queryByRole('button', { name: /Add Biscuits/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Baby wipes/ })).toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), 'gripe')
    expect(screen.getAllByRole('button', { name: /^Add / })).toHaveLength(1)
    await userEvent.type(screen.getByRole('searchbox'), 'xyz')
    expect(await screen.findByRole('heading', { name: 'No items match' })).toBeInTheDocument()
  })

  it('names the item when stock ran out after it went in the cart', async () => {
    const { test } = await asStaff('/staff/new-order')
    await addItem(/Add Vitamin C/)
    await addItem(/Add Vitamin C/)

    // Meanwhile the owner sells two from another phone.
    const owner = test.otherBrowser()
    await owner.auth.signIn(DEMO.owner)
    const vitaminC = (await owner.items.list()).find((item) => item.name.startsWith('Vitamin C'))!
    await owner.orders.create({
      clientOrderId: crypto.randomUUID(),
      lines: [{ itemId: vitaminC.id, quantity: 2 }],
      paymentMethod: 'cash',
      paymentReference: '',
      paymentConfirmed: true,
      customerName: '',
      customerPhone: '',
      note: '',
    })

    const cart = await openCart()
    await userEvent.click(within(cart).getByRole('radio', { name: 'Cash' }))
    await userEvent.click(within(cart).getByRole('checkbox', { name: /Payment received/ }))
    await userEvent.click(within(cart).getByRole('button', { name: 'Confirm order' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm order' }))

    expect(
      await within(cart).findByText(/Not enough stock: Vitamin C .* \(1 left\)/),
    ).toBeInTheDocument()
    expect(await within(cart).findByText('Only 1 left')).toBeInTheDocument()
  })
})

describe('held orders', () => {
  it('holds a cart without taking stock, then resumes and confirms it', async () => {
    const { test } = await asStaff('/staff/new-order')
    const before = await quantityOf(test.api, 'Chocolate bar')
    await addItem(/Add Chocolate bar/)
    const cart = await openCart()
    await userEvent.click(within(cart).getByText('Customer details (optional)'))
    await userEvent.type(within(cart).getByLabelText('Customer name'), 'Mr Okafor')
    await userEvent.click(within(cart).getByRole('button', { name: 'Hold order' }))

    expect(await screen.findByText('Order held')).toBeInTheDocument()
    expect(await quantityOf(test.api, 'Chocolate bar')).toBe(before)

    await userEvent.click(screen.getAllByRole('link', { name: 'My orders' })[0]!)
    await userEvent.click(await screen.findByRole('tab', { name: /Held/ }))
    const held = await screen.findByText('Mr Okafor')
    const card = held.closest('li')!
    expect(card).toHaveTextContent('1 item')
    await userEvent.click(within(card).getByRole('button', { name: 'Resume' }))

    await screen.findByRole('heading', { name: 'New order' })
    const resumed = await openCart()
    expect(within(resumed).getByText('Resumed from a held order')).toBeInTheDocument()
    await userEvent.click(within(resumed).getByRole('radio', { name: 'Card machine' }))
    await userEvent.click(within(resumed).getByRole('checkbox', { name: /Payment received/ }))
    await userEvent.click(within(resumed).getByRole('button', { name: 'Confirm order' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Confirm order' }),
    )

    await screen.findByRole('heading', { name: /confirmed/ })
    expect((await test.api.held.list()).map((hold) => hold.customerName)).not.toContain('Mr Okafor')
    expect(await quantityOf(test.api, 'Chocolate bar')).toBe((before ?? 0) - 1)
  })

  it('discards a held order after asking', async () => {
    const { test } = await asStaff('/staff/orders')
    await userEvent.click(await screen.findByRole('tab', { name: /Held/ }))
    const card = (await screen.findByText('Mrs Bello')).closest('li')!
    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }),
    )
    await waitFor(async () => expect(await test.api.held.list()).toEqual([]))
    expect(await screen.findByRole('heading', { name: 'No held orders' })).toBeInTheDocument()
  })
})

describe('my orders', () => {
  it("lists today's own orders with their totals, but no day total", async () => {
    const { test } = await asStaff('/staff/orders')
    const mine = await test.api.orders.listMine()
    const rows = await screen.findAllByRole('link', { name: /#\d{4}/ })
    expect(rows).toHaveLength(mine.length)
    expect(screen.queryByText(/total today|sales today/i)).not.toBeInTheDocument()

    await userEvent.click(rows[0]!)
    expect(await screen.findByRole('heading', { name: /^Order #\d{4}$/ })).toBeInTheDocument()
    expect(screen.getByText('Payment confirmed by')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('Total')
  })

  it("does not open another staff member's order", async () => {
    const { test } = await asStaff('/staff/orders')
    const other = test.otherBrowser()
    await other.auth.signIn({ ...DEMO.staff, username: 'bola' })
    const [theirs] = await other.orders.listMine()
    if (!theirs) throw new Error('demo data should give Bola an order today')

    renderApp({ path: `/staff/orders/${theirs.id}`, api: test.api })
    expect(
      await screen.findByRole('heading', { name: "We couldn't find that" }),
    ).toBeInTheDocument()
  })
})

describe('items and profile', () => {
  it('shows staff prices and stock, never cost prices', async () => {
    await asStaff('/staff/items')
    expect(await screen.findByText('Bottled water 75cl')).toBeInTheDocument()
    expect(screen.getByText('Malaria test kit').closest('div')?.parentElement).toHaveTextContent(
      'Out of stock',
    )
    expect(screen.queryByText(/cost/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Mosquito coils')).not.toBeInTheDocument()
  })

  it('changes the password, checking the current one first', async () => {
    const { test } = await asStaff('/staff/profile')
    await userEvent.type(await screen.findByLabelText('Current password'), 'not-the-password')
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-1')
    await userEvent.type(screen.getByLabelText('New password again'), 'brand-new-1')
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription(
        expect.stringContaining("Your current password isn't right"),
      ),
    )

    await userEvent.clear(screen.getByLabelText('Current password'))
    await userEvent.type(screen.getByLabelText('Current password'), DEMO.password)
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Password changed')).toBeInTheDocument()

    const fresh = test.otherBrowser()
    expect((await fresh.auth.signIn({ ...DEMO.staff, password: 'brand-new-1' })).kind).toBe('user')
  })
})
