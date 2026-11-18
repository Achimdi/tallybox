import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { formatOrderNumber } from '@/domain/orders'
import { DEMO, signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

/** The owner portal, on the real mock data layer with the demo shop. */

async function itemNamed(api: Awaited<ReturnType<typeof signedInTestApi>>['api'], name: string) {
  const items = await api.items.list()
  const item = items.find((candidate) => candidate.name === name)
  if (!item) throw new Error(`no demo item ${name}`)
  return item
}

describe('owner dashboard', () => {
  it("shows today's figures, quick actions and the access-ending banner", async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/dashboard', api: test.api })
    expect(await screen.findByText('Sales today')).toBeInTheDocument()
    expect(screen.getByText(/Your Tallybox access ends on/)).toBeInTheDocument()
    expect(screen.getByText('Contact tallybox3@gmail.com')).toBeInTheDocument()
    const actions = screen.getByRole('navigation', { name: 'Quick actions' })
    expect(within(actions).getByRole('link', { name: /Restock/ })).toHaveAttribute(
      'href',
      '/owner/restock',
    )
    expect(within(actions).getByRole('link', { name: /Add item/ })).toHaveAttribute(
      'href',
      '/owner/items/new',
    )
  })
})

describe('owner items', () => {
  it('adds an item with opening stock and a cost price, then archives and restores it', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/items/new', api: test.api })

    await userEvent.type(await screen.findByLabelText(/^Name/), 'Hand sanitiser 50ml')
    await userEvent.type(screen.getByLabelText(/^Selling price/), '800')
    await userEvent.type(screen.getByLabelText(/^Cost price/), '500')
    await userEvent.type(screen.getByLabelText(/^Opening quantity/), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hand sanitiser 50ml' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('38% margin', { exact: false })).toBeInTheDocument()
    // The opening stock is the first entry in its stock history.
    expect(await screen.findByText('+12')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))
    expect(await screen.findByText('This item is archived')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(screen.queryByText('This item is archived')).not.toBeInTheDocument())
  })

  it('explains that the unit is a word and the stock count goes in Opening quantity', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/items/new', api: test.api })
    await userEvent.type(await screen.findByLabelText(/^Name/), 'Paracetamol 1g')
    await userEvent.type(screen.getByLabelText(/^Unit name/), '100')
    await userEvent.type(screen.getByLabelText(/^Selling price/), '500')
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(
      await screen.findByText(/Use a word for one of it, like pack or bottle/),
    ).toBeInTheDocument()
    expect((await test.api.items.list()).some((item) => item.name === 'Paracetamol 1g')).toBe(false)
  })

  it('refuses a name already in use, on the name field', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/items/new', api: test.api })
    await userEvent.type(await screen.findByLabelText(/^Name/), 'paracetamol 500mg (12 tablets)')
    await userEvent.type(screen.getByLabelText(/^Selling price/), '300')
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(screen.getByLabelText(/^Name/)).toBeInvalid())
  })
})

describe('restock and adjust', () => {
  it('records a delivery and the stock goes up', async () => {
    const test = await signedInTestApi('owner')
    const before = await itemNamed(test.api, 'Paracetamol 500mg (12 tablets)')
    renderApp({ path: `/owner/restock?item=${before.id}`, api: test.api })

    await userEvent.type(await screen.findByLabelText(/^Quantity received/), '24')
    await userEvent.type(screen.getByLabelText(/^Supplier/), 'Emzor')
    await userEvent.click(screen.getByRole('button', { name: 'Save delivery' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Items' })).toBeInTheDocument()
    const after = await itemNamed(test.api, before.name)
    expect(after.quantity).toBe(before.quantity + 24)
  })

  it('asks for at least one item and a whole quantity', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/restock', api: test.api })
    await userEvent.click(await screen.findByRole('button', { name: 'Save delivery' }))
    expect(screen.getByText('Add at least one item.')).toBeInTheDocument()
  })

  it('sets stock to the counted number, with a reason, after confirming', async () => {
    const test = await signedInTestApi('owner')
    const item = await itemNamed(test.api, 'Cough syrup 100ml')
    renderApp({ path: `/owner/items/${item.id}/adjust`, api: test.api })

    await userEvent.type(
      await screen.findByLabelText(/^What you counted/),
      String(item.quantity - 2),
    )
    expect(screen.getByText(/^Difference: −2/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'Damaged' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }))

    expect(await screen.findByRole('heading', { level: 1, name: item.name })).toBeInTheDocument()
    expect((await itemNamed(test.api, item.name)).quantity).toBe(item.quantity - 2)
  })

  it('says so when stock changed while counting, and offers the new number', async () => {
    const test = await signedInTestApi('owner')
    const item = await itemNamed(test.api, 'Antacid tablets')
    renderApp({ path: `/owner/items/${item.id}/adjust`, api: test.api })
    await screen.findByLabelText(/^What you counted/)

    // Meanwhile, a delivery arrives from another browser.
    await test.api.stock.restock({
      clientId: crypto.randomUUID(),
      receivedOn: new Date().toISOString().slice(0, 10),
      supplier: '',
      note: '',
      lines: [{ itemId: item.id, quantity: 5, unitCost: null }],
    })

    await userEvent.type(screen.getByLabelText(/^What you counted/), '1')
    await userEvent.click(screen.getByRole('radio', { name: 'Miscount' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save adjustment' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Save adjustment',
      }),
    )

    expect(
      await screen.findByText(
        `Stock changed while you were counting. It's now ${item.quantity + 5}.`,
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Use the new number' }))
    expect(screen.getByText(String(item.quantity + 5))).toBeInTheDocument()
  })
})

describe('owner orders', () => {
  it("lists today's orders from everyone and voids one, returning its stock", async () => {
    const test = await signedInTestApi('owner')
    const staff = test.otherBrowser()
    await staff.auth.signIn(DEMO.staff)
    const item = await itemNamed(test.api, 'Vitamin C 1000mg (20 tablets)')
    const order = await staff.orders.create({
      clientOrderId: crypto.randomUUID(),
      lines: [{ itemId: item.id, quantity: 2 }],
      paymentMethod: 'cash',
      paymentReference: '',
      paymentConfirmed: true,
      customerName: '',
      customerPhone: '',
      note: '',
    })

    renderApp({ path: '/owner/orders', api: test.api })
    const row = await screen.findByRole('link', {
      name: new RegExp(formatOrderNumber(order.orderNumber)),
    })
    expect(row).toHaveTextContent('Ada')
    await userEvent.click(row)

    await userEvent.click(await screen.findByRole('button', { name: 'Void order' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void order' }))
    expect(await within(dialog).findByText('Say why it is being voided.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Customer returned it')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void order' }))

    expect(await screen.findByText(/Reason: Customer returned it/)).toBeInTheDocument()
    expect((await itemNamed(test.api, item.name)).quantity).toBe(item.quantity)
    expect(screen.queryByRole('button', { name: 'Void order' })).not.toBeInTheDocument()
  })

  it('finds an order by its number', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/orders', api: test.api })
    await userEvent.click(await screen.findByRole('radio', { name: 'This month' }))
    const first = (await screen.findAllByRole('link', { name: /^#\d+/ }))[0]
    const number = /#(\d+)/.exec(first?.textContent ?? '')?.[1] ?? ''
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find an order number' }), number)
    await waitFor(() => expect(screen.getAllByRole('link', { name: /^#\d+/ })).toHaveLength(1))
  })
})

describe('staff management', () => {
  it('resets a password, and the staff member signs in with it', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/staff', api: test.api })
    await userEvent.click(await screen.findByRole('link', { name: /Bola/ }))
    await userEvent.type(await screen.findByLabelText(/^New temporary password/), 'fresh-pass-9')
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText('Password changed')).toBeInTheDocument()

    const browser = test.otherBrowser()
    expect(
      await browser.auth.signIn({ ...DEMO.staff, username: 'bola', password: 'fresh-pass-9' }),
    ).toMatchObject({ kind: 'user' })
  })

  it('turns an account off after asking, and back on', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/staff', api: test.api })
    await userEvent.click(await screen.findByRole('link', { name: /Ada/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off account' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Turn off' }),
    )
    expect(await screen.findByText('This account is turned off')).toBeInTheDocument()

    expect(await test.otherBrowser().auth.signIn(DEMO.staff)).not.toMatchObject({ kind: 'user' })
    await userEvent.click(screen.getByRole('button', { name: 'Turn account back on' }))
    await waitFor(() =>
      expect(screen.queryByText('This account is turned off')).not.toBeInTheDocument(),
    )
  })
})

describe('business settings', () => {
  it('saves the receipt details, and warns before a currency change', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/settings', api: test.api })

    const footer = await screen.findByLabelText(/^Receipt message/)
    await userEvent.clear(footer)
    await userEvent.type(footer, 'Get well soon')
    expect(screen.getByLabelText(/^Business code/)).toHaveAttribute('readonly')

    await userEvent.selectOptions(screen.getByLabelText(/^Currency/), 'GHS')
    expect(screen.getByText('Prices are not converted')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/^Currency/), 'NGN')
    expect(screen.queryByText('Prices are not converted')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(async () =>
      expect((await test.api.business.get()).receiptFooter).toBe('Get well soon'),
    )
  })

  it('uses the Tallybox watermark by default, and saves the owner’s own or none', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/settings', api: test.api })

    const choices = await screen.findByRole('group', { name: 'Receipt watermark' })
    expect(within(choices).getByRole('radio', { name: /^Tallybox/ })).toBeChecked()
    // The preview shows the Tallybox mark behind a made-up receipt.
    const preview = screen.getByRole('figure', { name: 'Preview' })
    expect(within(preview).getByTestId('receipt-watermark')).toHaveTextContent('Tallybox')
    expect(screen.queryByLabelText(/^Watermark words/)).not.toBeInTheDocument()

    // Their own, with nothing in it, can't be saved.
    await userEvent.click(within(choices).getByRole('radio', { name: /^Your own/ }))
    const words = screen.getByLabelText(/^Watermark words/)
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Add some words, or use your logo.')).toBeInTheDocument()

    await userEvent.type(words, 'Sunrise Corner')
    expect(within(preview).getByTestId('receipt-watermark')).toHaveTextContent('Sunrise Corner')
    // No logo yet, so it can't be used.
    expect(screen.getByRole('checkbox', { name: /Use my logo/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(async () =>
      expect((await test.api.business.get()).watermark).toEqual({
        kind: 'custom',
        text: 'Sunrise Corner',
        useLogo: false,
      }),
    )

    await userEvent.click(within(choices).getByRole('radio', { name: /^None/ }))
    expect(within(preview).queryByTestId('receipt-watermark')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(async () =>
      expect((await test.api.business.get()).watermark).toEqual({
        kind: 'none',
        text: 'Sunrise Corner',
        useLogo: false,
      }),
    )
  })

  it('reaches every owner tool from More', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/more', api: test.api })
    for (const [name, href] of [
      ['Restock', '/owner/restock'],
      ['Stock ledger', '/owner/ledger'],
      ['Staff', '/owner/staff'],
      ['Business settings', '/owner/settings'],
      ['Profile', '/owner/profile'],
      ['Help', '/owner/help'],
    ] as const) {
      expect(await screen.findByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute(
        'href',
        href,
      )
    }
  })
})

describe('stock ledger', () => {
  it('shows every change and filters by type', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/ledger', api: test.api })
    await screen.findAllByText(/ · Sale$/)
    await userEvent.selectOptions(screen.getByLabelText(/^Type/), 'restock')
    await waitFor(() => expect(screen.queryAllByText(/ · Sale$/)).toHaveLength(0))
  })
})
