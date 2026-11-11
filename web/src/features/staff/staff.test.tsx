import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import { renderApp, signedInAs } from '@/test/render'
import { createStaff, useStaffCount } from './api'

vi.mock('./api', () => ({ createStaff: vi.fn(), useStaffCount: vi.fn() }))

const mockCreate = vi.mocked(createStaff)
const mockCount = vi.mocked(useStaffCount)

function staffCount(count: number) {
  mockCount.mockReturnValue({
    data: count,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useStaffCount>)
}

async function fillAndSubmit(name: string, username: string, password: string) {
  await userEvent.type(screen.getByLabelText(/^Name/), name)
  await userEvent.type(screen.getByLabelText(/^Username/), username)
  await userEvent.type(screen.getByLabelText(/^Temporary password/), password)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => {
  mockCreate.mockReset()
  staffCount(0)
})

describe('owner dashboard onboarding', () => {
  it('shows the two set-up steps and the business code', async () => {
    renderApp({ path: '/owner/dashboard', session: signedInAs('owner') })
    expect(await screen.findByText('Add your first items')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Create a staff account/ })).toHaveAttribute(
      'href',
      '/owner/staff/new',
    )
    expect(screen.getByText('test-shop')).toBeInTheDocument()
  })

  it('marks the staff step done once a staff account exists', async () => {
    staffCount(2)
    renderApp({ path: '/owner/dashboard', session: signedInAs('owner') })
    const step = await screen.findByRole('link', { name: /Create a staff account/ })
    expect(step).toHaveTextContent('Done')
    expect(step).toHaveTextContent('2 staff accounts so far')
  })
})

describe('create staff account', () => {
  it('creates the account and shows what to tell the staff member', async () => {
    mockCreate.mockResolvedValue({ id: 's1', username: 'chidi', displayName: 'Chidi Eze' })
    renderApp({ path: '/owner/staff/new', session: signedInAs('owner') })
    await screen.findByRole('heading', { name: 'Create staff account' })
    await fillAndSubmit('Chidi Eze', ' Chidi ', 'temp-pass-1')

    expect(await screen.findByText('Chidi Eze can now sign in')).toBeInTheDocument()
    expect(mockCreate).toHaveBeenCalledWith({
      displayName: 'Chidi Eze',
      username: 'chidi',
      password: 'temp-pass-1',
    })
    // The two things staff need besides the password.
    expect(screen.getByText('test-shop')).toBeInTheDocument()
    expect(screen.getByText('chidi')).toBeInTheDocument()
    // The password is never shown back.
    expect(screen.queryByText('temp-pass-1')).not.toBeInTheDocument()
  })

  it('checks the username and password before sending', async () => {
    renderApp({ path: '/owner/staff/new', session: signedInAs('owner') })
    await screen.findByRole('heading', { name: 'Create staff account' })
    await fillAndSubmit('Chidi', 'c d', 'short')

    expect(await screen.findByText(/Use 3 to 20 lowercase letters or digits/)).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('puts a taken username on the username field', async () => {
    mockCreate.mockRejectedValue(new AppError('username_taken'))
    renderApp({ path: '/owner/staff/new', session: signedInAs('owner') })
    await screen.findByRole('heading', { name: 'Create staff account' })
    await fillAndSubmit('Chidi Eze', 'chidi', 'temp-pass-1')

    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toBeInvalid())
    expect(screen.getByLabelText(/^Username/)).toHaveAccessibleDescription(
      expect.stringContaining('That username is taken'),
    )
  })

  it('explains when the business has been suspended in the meantime', async () => {
    mockCreate.mockRejectedValue(new AppError('business_suspended'))
    renderApp({ path: '/owner/staff/new', session: signedInAs('owner') })
    await screen.findByRole('heading', { name: 'Create staff account' })
    await fillAndSubmit('Chidi Eze', 'chidi', 'temp-pass-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('This business is suspended')
  })

  it('is not reachable by staff', async () => {
    renderApp({ path: '/owner/staff/new', session: signedInAs('staff') })
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this" }),
    ).toBeInTheDocument()
  })
})
