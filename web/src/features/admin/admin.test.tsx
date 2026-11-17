import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DEMO_IDS } from '@/api/mock/seed'
import { createTestApi, DEMO, signedInTestApi } from '@/test/mockApi'
import { renderApp, signedInAs } from '@/test/render'
import { activationMessage, whatsAppShareUrl } from './whatsapp'

/** The developer portal, on the demo data layer, signed in as the developer. */
async function openAdmin(path: string) {
  const test = await signedInTestApi('developer')
  const view = renderApp({ path, api: test.api })
  return { ...view, test }
}

describe('developer portal: businesses', () => {
  it('lists every business with its status and access period', async () => {
    await openAdmin('/admin/businesses')
    const sunrise = await screen.findByRole('link', { name: /Sunrise Pharmacy/ })
    expect(sunrise).toHaveTextContent('owner@demo.tallybox.test')
    expect(sunrise).toHaveTextContent(/Ends in 5 days/)
    expect(screen.getByRole('link', { name: /Harbour Bakery/ })).toHaveTextContent('Suspended')
    expect(screen.getByRole('link', { name: /Daily Needs Supermarket/ })).toHaveTextContent(
      'Access ended',
    )
    expect(screen.getByRole('link', { name: /Corner Mart/ })).toHaveTextContent('Open-ended')
  })

  it('filters by access situation and searches', async () => {
    await openAdmin('/admin/businesses')
    await screen.findByRole('link', { name: /Sunrise Pharmacy/ })

    await userEvent.click(screen.getByRole('radio', { name: /Access ended/ }))
    expect(
      screen.getAllByRole('link', { name: /Supermarket|Pharmacy|Mart|Restaurant/ }),
    ).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Daily Needs Supermarket/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: /^All/ }))
    await userEvent.type(screen.getByRole('searchbox'), 'corner')
    expect(screen.getByRole('link', { name: /Corner Mart/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sunrise Pharmacy/ })).not.toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(await screen.findByRole('heading', { name: 'No businesses match' })).toBeInTheDocument()
  })

  it('suspends a business with a reason and a confirmation, then reactivates it', async () => {
    const { test } = await openAdmin(`/admin/businesses/${DEMO_IDS.sunrise}`)
    expect(await screen.findByRole('heading', { name: 'Sunrise Pharmacy' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Suspend business' }))
    expect(await screen.findByText('Say why, so there is a record.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Reason for suspending'), 'Unpaid')
    await userEvent.click(screen.getByRole('button', { name: 'Suspend business' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Suspend Sunrise Pharmacy?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }))

    expect(await screen.findByRole('button', { name: 'Reactivate business' })).toBeInTheDocument()
    expect(screen.getByText('Unpaid')).toBeInTheDocument()

    // The owner, in another browser, is now locked out.
    const owner = test.otherBrowser()
    expect(await owner.auth.signIn(DEMO.owner)).toMatchObject({
      kind: 'blocked',
      notice: { reason: 'suspended' },
    })

    await userEvent.click(screen.getByRole('button', { name: 'Reactivate business' }))
    const reactivate = await screen.findByRole('alertdialog', {
      name: 'Reactivate Sunrise Pharmacy?',
    })
    await userEvent.click(within(reactivate).getByRole('button', { name: 'Reactivate' }))
    expect(await screen.findByRole('button', { name: 'Suspend business' })).toBeInTheDocument()
    expect((await owner.auth.signIn(DEMO.owner)).kind).toBe('user')
  })

  it('extends access by a preset, showing the new end date first', async () => {
    const { test } = await openAdmin(`/admin/businesses/${DEMO_IDS.dailyNeeds}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Extend access' }))

    const sheet = await screen.findByRole('dialog', { name: 'Extend access' })
    await userEvent.click(within(sheet).getByRole('radio', { name: '90 days' }))
    expect(within(sheet).getByText(/^New end date:/)).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      await test
        .otherBrowser()
        .auth.signIn({ ...DEMO.owner, email: 'dailyneeds@demo.tallybox.test' }),
    ).toMatchObject({
      kind: 'user',
    })
  })

  it('checks a custom number of days', async () => {
    await openAdmin(`/admin/businesses/${DEMO_IDS.sunrise}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Extend access' }))
    const sheet = await screen.findByRole('dialog', { name: 'Extend access' })
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Custom' }))
    await userEvent.type(within(sheet).getByLabelText('Number of days'), '0')
    expect(
      within(sheet).getByText('Enter a whole number of days from 1 to 3650.'),
    ).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('makes a simulated owner reset link in demo mode', async () => {
    await openAdmin(`/admin/businesses/${DEMO_IDS.sunrise}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Create reset link' }))
    expect(await screen.findByText('Simulated in demo mode')).toBeInTheDocument()
    expect(screen.getByText(/^https:\/\/reset\.demo\.invalid\//)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Share on WhatsApp' })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/?text='),
    )
  })

  it('shows a friendly not-found state for a business that does not exist', async () => {
    await openAdmin('/admin/businesses/biz-nope')
    expect(
      await screen.findByRole('heading', { name: "We couldn't find that" }),
    ).toBeInTheDocument()
  })
})

describe('developer portal: activation codes', () => {
  it('lists codes in every state and offers Revoke only for unused ones', async () => {
    await openAdmin('/admin/codes')
    expect(await screen.findByText('new.client@example.test')).toBeInTheDocument()
    for (const status of ['Unused', 'Used', 'Revoked', 'Expired']) {
      expect(screen.getAllByText(status, { selector: 'span' }).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(/Used by Corner Mart/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('asks before revoking a code', async () => {
    await openAdmin('/admin/codes')
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke this code?' })
    expect(confirm).toHaveTextContent('new.client@example.test')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke code' }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument(),
    )
  })

  it('generates a code with a redeem window and access length, shown once', async () => {
    const { test } = await openAdmin('/admin/codes/new')
    await userEvent.type(await screen.findByLabelText(/^Owner's email/), 'Fresh@Client.test')
    await userEvent.type(screen.getByLabelText(/^Note/), 'Fresh Foods')
    await userEvent.click(screen.getByRole('radio', { name: '180 days' }))
    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }))

    const codeText = await screen.findByText(/^TB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/)
    expect(screen.getByText(/Shown only this once/)).toHaveTextContent('Access: 180 days')
    const share = screen.getByRole('link', { name: 'Share on WhatsApp' })
    const message = decodeURIComponent(share.getAttribute('href') ?? '')
    expect(message).toContain(codeText.textContent ?? 'missing')
    expect(message).toContain('fresh@client.test')
    expect(message).toContain('/register')
    expect(message).toContain('180 days')
    expect(share).toHaveAttribute('rel', 'noopener noreferrer')

    const listed = (await test.api.admin.listActivationCodes()).find(
      (code) => code.ownerEmail === 'fresh@client.test',
    )
    expect(listed).toMatchObject({ status: 'unused', accessDays: 180, note: 'Fresh Foods' })
  })

  it('checks the form before asking for a code', async () => {
    await openAdmin('/admin/codes/new')
    await userEvent.type(await screen.findByLabelText(/^Owner's email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  })
})

describe('the developer portal stays hidden', () => {
  it.each(['owner', 'staff'] as const)('shows "page not found" to a signed-in %s', async (role) => {
    renderApp({ path: '/admin/codes', session: signedInAs(role), api: createTestApi().api })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('the WhatsApp message', () => {
  const code = {
    code: 'TB-7K4M-X9QD',
    ownerEmail: 'ada@shop.test',
    redeemBy: '2026-11-18T10:00:00Z',
    accessDays: 365,
  }

  it('contains the app link, the email, the code and both time limits', () => {
    const message = activationMessage(code, 'https://tallybox.pages.dev/register', 'Africa/Lagos')
    expect(message).toContain('https://tallybox.pages.dev/register')
    expect(message).toContain('ada@shop.test')
    expect(message).toContain('TB-7K4M-X9QD')
    expect(message).toContain('until Nov 18, 2026')
    expect(message).toContain('lasts 1 year from the day you register')
  })

  it('says when access has no end', () => {
    expect(
      activationMessage({ ...code, accessDays: null }, 'https://x.test/register', 'UTC'),
    ).toContain('no end date')
  })

  it('is safely encoded into the link', () => {
    expect(whatsAppShareUrl('Code: TB-7K4M-X9QD & more\nline two')).toBe(
      'https://wa.me/?text=Code%3A%20TB-7K4M-X9QD%20%26%20more%0Aline%20two',
    )
  })
})
