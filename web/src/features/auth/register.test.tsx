import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import { renderApp } from '@/test/render'
import { isBusinessCodeAvailable, registerBusiness } from './api'

vi.mock('./api', () => ({
  registerBusiness: vi.fn(),
  isBusinessCodeAvailable: vi.fn(),
}))

// A Turnstile check that has already passed.
vi.mock('./useTurnstile', () => ({
  useTurnstile: () => ({
    enabled: true,
    token: 'turnstile-token',
    element: null,
    reset: () => undefined,
  }),
}))

const mockRegister = vi.mocked(registerBusiness)
const mockAvailable = vi.mocked(isBusinessCodeAvailable)

const VALID = {
  'Business name': "Ada's Pharmacy",
  'Business code': 'Adas-Pharmacy',
  'Your full name': 'Ada Obi',
  Email: 'ada@shop.test',
  Password: 'correct-horse',
  'Activation code': 'tb-7k4m-x9qd',
}

function field(label: string): HTMLElement {
  // Required fields are labelled like "Email (required)".
  return screen.getByLabelText(new RegExp(`^${label}`))
}

async function fill(values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await userEvent.type(field(label), value)
  }
}

async function openRegister() {
  const view = renderApp({ path: '/register' })
  await screen.findByRole('heading', { name: 'Register your business' })
  return view
}

beforeEach(() => {
  mockRegister.mockReset()
  mockAvailable.mockReset()
  mockAvailable.mockResolvedValue(true)
})

describe('registration', () => {
  it('registers the business, then sends the owner to sign in', async () => {
    mockRegister.mockResolvedValue({ businessCode: 'adas-pharmacy' })
    const { router } = await openRegister()
    await fill(VALID)
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login/owner'))
    expect(mockRegister).toHaveBeenCalledWith({
      businessName: "Ada's Pharmacy",
      businessCode: 'adas-pharmacy',
      ownerName: 'Ada Obi',
      email: 'ada@shop.test',
      password: 'correct-horse',
      phone: '',
      activationCode: 'tb-7k4m-x9qd',
      turnstileToken: 'turnstile-token',
    })
    expect(await screen.findByText('Your business is registered')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('ada@shop.test')
  })

  it('checks the details in the browser before sending anything', async () => {
    await openRegister()
    await fill({
      'Business name': 'A',
      'Business code': 'My Shop',
      Email: 'not-an-email',
      Password: 'short',
      'Activation code': 'TB-0000-0000',
    })
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    expect(await screen.findByText(/at least 2 characters/)).toBeInTheDocument()
    expect(screen.getByText('Use only lowercase letters, digits and hyphens.')).toBeInTheDocument()
    expect(screen.getByText('Enter your full name.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText(/exactly as you received it/)).toBeInTheDocument()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('says so as soon as a typed business code is available', async () => {
    await openRegister()
    await userEvent.type(field('Business code'), 'adas-pharmacy')
    expect(await screen.findByText('adas-pharmacy is available')).toBeInTheDocument()
    expect(mockAvailable).toHaveBeenCalledWith('adas-pharmacy')
  })

  it('stops a taken business code before the form is sent', async () => {
    mockAvailable.mockResolvedValue(false)
    await openRegister()
    await fill(VALID)
    expect(
      await screen.findByText('That business code is taken. Choose another.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register business' })).toBeDisabled()
  })

  it('does not ask the server about a badly formed business code', async () => {
    await openRegister()
    await userEvent.type(field('Business code'), 'ab')
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(mockAvailable).not.toHaveBeenCalled()
  })

  it.each([
    ['activation_code_expired', 'Activation code', 'That activation code has expired'],
    ['activation_code_invalid', 'Activation code', "That activation code doesn't match"],
    ['activation_code_used', 'Activation code', 'That activation code was already used'],
    ['business_code_taken', 'Business code', 'That business code is taken'],
    ['email_taken', 'Email', 'That email already has an account'],
  ] as const)('puts a %s refusal on the right field', async (code, label, message) => {
    mockRegister.mockRejectedValue(new AppError(code))
    await openRegister()
    await fill(VALID)
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() => expect(field(label)).toBeInvalid())
    expect(field(label)).toHaveAccessibleDescription(expect.stringContaining(message))
  })

  it('shows other failures above the form', async () => {
    mockRegister.mockRejectedValue(new AppError('rate_limited'))
    await openRegister()
    await fill(VALID)
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })
})
