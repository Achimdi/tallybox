import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callFunction, callRpc } from '@/lib/api'
import { AppError } from '@/lib/errors'
import { renderApp, signedInAs } from '@/test/render'
import { activationMessage, whatsAppShareUrl } from './whatsapp'

vi.mock('@/lib/api', () => ({ callRpc: vi.fn(), callFunction: vi.fn() }))

const mockRpc = vi.mocked(callRpc)
const mockFunction = vi.mocked(callFunction)

const BUSINESSES = [
  {
    id: 'b-a',
    name: 'Shop A',
    business_code: 'shop-a',
    status: 'active',
    created_at: '2026-11-01T10:00:00Z',
    owner_email: 'owner-a@a.test',
    staff_count: 2,
    last_activity_at: '2026-11-10T09:30:00Z',
    suspended_at: null,
    suspended_reason: null,
  },
  {
    id: 'b-b',
    name: 'Shop B',
    business_code: 'shop-b',
    status: 'suspended',
    created_at: '2026-11-02T10:00:00Z',
    owner_email: 'owner-b@b.test',
    staff_count: 0,
    last_activity_at: null,
    suspended_at: '2026-11-09T12:00:00Z',
    suspended_reason: 'Unpaid',
  },
]

const CODES = [
  {
    id: 'c-1',
    owner_email: 'new@client.test',
    note: 'Corner shop',
    status: 'unused',
    created_at: '2026-11-10T10:00:00Z',
    expires_at: '2026-11-17T10:00:00Z',
    used_at: null,
    used_by_business_name: null,
  },
  {
    id: 'c-2',
    owner_email: 'owner-a@a.test',
    note: null,
    status: 'used',
    created_at: '2026-11-01T09:00:00Z',
    expires_at: '2026-11-08T09:00:00Z',
    used_at: '2026-11-01T10:00:00Z',
    used_by_business_name: 'Shop A',
  },
]

const COUNTS = { businesses: 2, suspended: 1, staff: 2, unused_codes: 1 }

function serveRpc(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    admin_list_businesses: BUSINESSES,
    admin_list_activation_codes: CODES,
    admin_platform_counts: COUNTS,
    ...overrides,
  }
  mockRpc.mockImplementation((name: string) => {
    const value = data[name]
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value)
  })
}

beforeEach(() => {
  mockRpc.mockReset()
  mockFunction.mockReset()
  serveRpc()
})

describe('admin: businesses', () => {
  it('lists every business with its status in words', async () => {
    renderApp({ path: '/admin/businesses', session: signedInAs('super_admin') })
    const rowA = await screen.findByRole('button', { name: /Shop A/ })
    expect(rowA).toHaveTextContent('owner-a@a.test')
    expect(rowA).toHaveTextContent('Active')
    expect(screen.getByRole('button', { name: /Shop B/ })).toHaveTextContent('Suspended')
  })

  it('needs a reason and a confirmation before suspending', async () => {
    mockFunction.mockResolvedValue({ status: 'suspended' })
    renderApp({ path: '/admin/businesses', session: signedInAs('super_admin') })
    await userEvent.click(await screen.findByRole('button', { name: /Shop A/ }))

    const sheet = await screen.findByRole('dialog', { name: 'Shop A' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Suspend business' }))
    expect(await within(sheet).findByText('Say why, so there is a record.')).toBeInTheDocument()
    expect(mockFunction).not.toHaveBeenCalled()

    await userEvent.type(within(sheet).getByLabelText('Reason for suspending'), ' Unpaid ')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Suspend business' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Suspend Shop A?' })
    expect(mockFunction).not.toHaveBeenCalled()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Suspend' }))

    await waitFor(() =>
      expect(mockFunction).toHaveBeenCalledWith(
        'set-business-status',
        { businessId: 'b-a', status: 'suspended', reason: 'Unpaid' },
        expect.anything(),
      ),
    )
  })

  it('reactivates a suspended business without asking for a reason', async () => {
    mockFunction.mockResolvedValue({ status: 'active' })
    renderApp({ path: '/admin/businesses', session: signedInAs('super_admin') })
    await userEvent.click(await screen.findByRole('button', { name: /Shop B/ }))

    const sheet = await screen.findByRole('dialog', { name: 'Shop B' })
    expect(sheet).toHaveTextContent('Unpaid')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Reactivate business' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Reactivate Shop B?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Reactivate' }))

    await waitFor(() =>
      expect(mockFunction).toHaveBeenCalledWith(
        'set-business-status',
        { businessId: 'b-b', status: 'active' },
        expect.anything(),
      ),
    )
  })

  it('shows an empty state before the first business registers', async () => {
    serveRpc({ admin_list_businesses: [] })
    renderApp({ path: '/admin/businesses', session: signedInAs('super_admin') })
    expect(await screen.findByRole('heading', { name: 'No businesses yet' })).toBeInTheDocument()
  })

  it('shows a friendly error with a retry when the list cannot load', async () => {
    // A refusal is not retried, so the error shows at once. (Offline errors are
    // retried twice with a delay before the error state appears.)
    serveRpc({ admin_list_businesses: new AppError('permission_denied') })
    renderApp({ path: '/admin/businesses', session: signedInAs('super_admin') })
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to this")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('admin: activation codes', () => {
  it('lists codes with their status and offers Revoke only for unused ones', async () => {
    renderApp({ path: '/admin/codes', session: signedInAs('super_admin') })
    expect(await screen.findByText('new@client.test')).toBeInTheDocument()
    expect(screen.getByText('Unused')).toBeInTheDocument()
    expect(screen.getByText('Used')).toBeInTheDocument()
    expect(screen.getByText(/Used by Shop A/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('generates a code and shows it once, ready to copy or share', async () => {
    mockFunction.mockResolvedValue({
      id: 'c-9',
      code: 'TB-7K4M-X9QD',
      ownerEmail: 'ada@shop.test',
      expiresAt: '2026-11-18T10:00:00Z',
    })
    renderApp({ path: '/admin/codes', session: signedInAs('super_admin') })
    await screen.findByText('new@client.test')

    await userEvent.type(screen.getByLabelText(/^Owner's email/), 'ada@shop.test')
    await userEvent.type(screen.getByLabelText('Note'), "Ada's pharmacy")
    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }))

    expect(await screen.findByText('TB-7K4M-X9QD')).toBeInTheDocument()
    expect(mockFunction).toHaveBeenCalledWith(
      'generate-activation-code',
      { ownerEmail: 'ada@shop.test', note: "Ada's pharmacy", expiresInDays: 7 },
      expect.anything(),
    )
    expect(screen.getByText(/Shown only this once/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()

    const share = screen.getByRole('link', { name: 'Share on WhatsApp' })
    const href = decodeURIComponent(share.getAttribute('href') ?? '')
    expect(href).toContain('https://wa.me/?text=')
    expect(href).toContain('TB-7K4M-X9QD')
    expect(href).toContain('/register')
    expect(href).toContain('ada@shop.test')
    expect(share).toHaveAttribute('rel', 'noopener noreferrer')

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('TB-7K4M-X9QD')).not.toBeInTheDocument()
  })

  it('checks the email before asking for a code', async () => {
    renderApp({ path: '/admin/codes', session: signedInAs('super_admin') })
    await screen.findByText('new@client.test')
    await userEvent.type(screen.getByLabelText(/^Owner's email/), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
    expect(mockFunction).not.toHaveBeenCalled()
  })

  it('asks before revoking a code', async () => {
    mockFunction.mockResolvedValue({ revoked: true })
    renderApp({ path: '/admin/codes', session: signedInAs('super_admin') })
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }))

    const confirm = await screen.findByRole('alertdialog', { name: 'Revoke this code?' })
    expect(confirm).toHaveTextContent('new@client.test')
    expect(mockFunction).not.toHaveBeenCalled()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revoke code' }))

    await waitFor(() =>
      expect(mockFunction).toHaveBeenCalledWith(
        'revoke-activation-code',
        { codeId: 'c-1' },
        expect.anything(),
      ),
    )
  })
})

describe('the admin area stays hidden', () => {
  it.each(['owner', 'staff'] as const)('never asks the server on behalf of a %s', async (role) => {
    renderApp({ path: '/admin/codes', session: signedInAs(role) })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(mockRpc).not.toHaveBeenCalledWith('admin_list_activation_codes', {}, expect.anything())
  })
})

describe('the WhatsApp message', () => {
  const code = {
    code: 'TB-7K4M-X9QD',
    ownerEmail: 'ada@shop.test',
    expiresAt: '2026-11-18T10:00:00Z',
  }

  it('contains the app link, the email and the code', () => {
    const message = activationMessage(code, 'https://tallybox.pages.dev/register', 'Africa/Lagos')
    expect(message).toContain('https://tallybox.pages.dev/register')
    expect(message).toContain('ada@shop.test')
    expect(message).toContain('TB-7K4M-X9QD')
    expect(message).toContain('Nov 18, 2026')
  })

  it('is safely encoded into the link', () => {
    const url = whatsAppShareUrl('Code: TB-7K4M-X9QD & more\nline two')
    expect(url).toBe('https://wa.me/?text=Code%3A%20TB-7K4M-X9QD%20%26%20more%0Aline%20two')
  })
})
