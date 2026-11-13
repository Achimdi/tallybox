import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import { renderApp, renderPage, signedInAs } from '@/test/render'
import OwnerLoginPage from './OwnerLoginPage'
import StaffLoginPage from './StaffLoginPage'

// No Turnstile widget in these tests: sign-in is not held up waiting for it.
vi.mock('./useTurnstile', () => ({
  useTurnstile: () => ({ enabled: false, token: null, element: null, reset: () => undefined }),
}))

const GENERIC = 'Check your business code, username and password'

async function fillOwner(email: string, password: string) {
  await userEvent.type(screen.getByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

async function fillStaff(code: string, username: string, password: string) {
  const codeField = screen.getByLabelText('Business code')
  await userEvent.clear(codeField)
  await userEvent.type(codeField, code)
  await userEvent.type(screen.getByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('owner login', () => {
  it('asks for both fields before contacting the server', async () => {
    const signIn = vi.fn()
    renderPage(<OwnerLoginPage />, { session: { signIn } })
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(signIn).not.toHaveBeenCalled()
  })

  it('signs in through the owner portal', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    renderPage(<OwnerLoginPage />, { session: { signIn } })
    await fillOwner('ada@shop.test', 'correct-horse')
    expect(signIn).toHaveBeenCalledWith({
      portal: 'owner',
      email: 'ada@shop.test',
      password: 'correct-horse',
      captchaToken: undefined,
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    ['invalid_credentials', "Those details don't match"],
    ['rate_limited', 'Too many attempts'],
    ['offline', "You're offline"],
    ['account_disabled', 'This account is turned off'],
    ['business_suspended', 'This business is suspended'],
  ] as const)('explains a %s failure in plain words', async (code, title) => {
    const signIn = vi.fn().mockRejectedValue(new AppError(code))
    renderPage(<OwnerLoginPage />, { session: { signIn } })
    await fillOwner('ada@shop.test', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent(title)
  })

  it('points staff to the staff login page', async () => {
    const signIn = vi.fn().mockRejectedValue(new AppError('wrong_portal'))
    renderPage(<OwnerLoginPage />, { session: { signIn } })
    await fillOwner('chidi@shop.test', 'password1')
    expect(await screen.findByRole('alert')).toHaveTextContent('This is a staff account')
    expect(screen.getByRole('link', { name: 'Go to staff login' })).toHaveAttribute(
      'href',
      '/login/staff',
    )
  })

  it('never shows raw error text', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(new Error('AuthApiError: Database error querying schema'))
    renderPage(<OwnerLoginPage />, { session: { signIn } })
    await fillOwner('ada@shop.test', 'x')
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.queryByText(/Database error/)).not.toBeInTheDocument()
  })

  it('can show and hide the password', async () => {
    renderPage(<OwnerLoginPage />)
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('welcomes a newly registered owner and fills in their email', () => {
    renderPage(<OwnerLoginPage />, { state: { registeredEmail: 'ada@shop.test' } })
    expect(screen.getByRole('status')).toHaveTextContent('Your business is registered')
    expect(screen.getByLabelText('Email')).toHaveValue('ada@shop.test')
  })

  it('links to the forgot-password help', () => {
    renderPage(<OwnerLoginPage />)
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })
})

describe('staff login', () => {
  beforeEach(() => window.localStorage.clear())

  it('signs in with business code, username and password', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    renderPage(<StaffLoginPage />, { session: { signIn } })
    await fillStaff('Adas-Pharmacy', 'chidi', 'temp-pass-1')
    expect(signIn).toHaveBeenCalledWith({
      portal: 'staff',
      businessCode: 'Adas-Pharmacy',
      username: 'chidi',
      password: 'temp-pass-1',
      captchaToken: undefined,
    })
  })

  it('remembers the business code on this device after a successful sign-in', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    const first = renderPage(<StaffLoginPage />, { session: { signIn } })
    await fillStaff(' Adas-Pharmacy ', 'chidi', 'temp-pass-1')
    first.unmount()

    renderPage(<StaffLoginPage />)
    expect(screen.getByLabelText('Business code')).toHaveValue('adas-pharmacy')
    expect(screen.getByLabelText('Username')).toHaveValue('')
  })

  it('does not remember the business code when sign-in fails', async () => {
    const signIn = vi.fn().mockRejectedValue(new AppError('invalid_credentials'))
    const first = renderPage(<StaffLoginPage />, { session: { signIn } })
    await fillStaff('guessing', 'someone', 'nope')
    await screen.findByRole('alert')
    first.unmount()

    renderPage(<StaffLoginPage />)
    expect(screen.getByLabelText('Business code')).toHaveValue('')
  })

  it.each(['invalid_credentials', 'validation', 'not_found', 'unknown'] as const)(
    'gives the same message for a %s failure, so nothing can be discovered',
    async (code) => {
      const signIn = vi.fn().mockRejectedValue(new AppError(code))
      renderPage(<StaffLoginPage />, { session: { signIn } })
      await fillStaff('no-such-shop', 'nobody', 'whatever')
      expect(await screen.findByRole('alert')).toHaveTextContent(GENERIC)
    },
  )

  it.each([
    ['rate_limited', 'Too many attempts'],
    ['offline', "You're offline"],
    ['business_suspended', 'This business is suspended'],
    ['account_disabled', 'This account is turned off'],
  ] as const)('is specific about %s, which reveals nothing about accounts', async (code, title) => {
    const signIn = vi.fn().mockRejectedValue(new AppError(code))
    renderPage(<StaffLoginPage />, { session: { signIn } })
    await fillStaff('adas-pharmacy', 'chidi', 'temp-pass-1')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(title)
    expect(alert).not.toHaveTextContent(GENERIC)
  })
})

describe('after signing in', () => {
  it('sends an owner who opens a login page to their dashboard', async () => {
    const { router } = renderApp({ path: '/login/owner', session: signedInAs('owner') })
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/owner/dashboard')
  })

  it('sends the super-admin to the admin area', async () => {
    const { router } = renderApp({ path: '/login/owner', session: signedInAs('super_admin') })
    expect(await screen.findByRole('heading', { name: 'Businesses' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/businesses')
  })
})

describe('suspended and turned-off accounts', () => {
  it('shows the suspended screen instead of the welcome page', async () => {
    const { router } = renderApp({
      path: '/',
      blocked: { reason: 'suspended', businessName: 'Test Shop', accessEndedAt: null },
    })
    expect(
      await screen.findByRole('heading', { name: 'Test Shop is suspended' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/suspended')
    expect(screen.getByText(/nothing has been deleted/)).toBeInTheDocument()
  })

  it('sends a guarded address to the suspended screen too', async () => {
    const { router } = renderApp({
      path: '/owner/dashboard',
      blocked: { reason: 'suspended', businessName: 'Test Shop', accessEndedAt: null },
    })
    expect(
      await screen.findByRole('heading', { name: 'Test Shop is suspended' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/suspended')
  })

  it('words a turned-off account differently from a suspended business', async () => {
    renderApp({
      path: '/',
      blocked: { reason: 'disabled', businessName: 'Test Shop', accessEndedAt: null },
    })
    expect(
      await screen.findByRole('heading', { name: 'This account is turned off' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ask them to turn it back on/)).toBeInTheDocument()
  })

  it('lets the person go back to the start', async () => {
    const { router } = renderApp({
      path: '/',
      blocked: { reason: 'suspended', businessName: 'Test Shop', accessEndedAt: null },
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Back to start' }))
    expect(await screen.findByRole('link', { name: 'Owner login' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('forgot password', () => {
  it('explains the manual reset and shows the support contact', async () => {
    renderApp({ path: '/forgot-password' })
    expect(
      await screen.findByRole('heading', { name: 'Forgot your password?' }),
    ).toBeInTheDocument()
    expect(screen.getByText('tallybox3@gmail.com')).toBeInTheDocument()
    expect(screen.getByText(/Ask the business owner/)).toBeInTheDocument()
  })
})

describe('signing in on the demo data layer', () => {
  it('fills the form from a demo account and lands the owner on the dashboard', async () => {
    const { router } = renderApp({ path: '/login/owner' })
    await userEvent.click(await screen.findByRole('button', { name: /Owner, Sunrise Pharmacy/ }))
    expect(screen.getByLabelText('Email')).toHaveValue('owner@demo.tallybox.test')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/owner/dashboard')
  })

  it('signs staff in with business code, username and password', async () => {
    const { router } = renderApp({ path: '/login/staff' })
    await userEvent.click(await screen.findByRole('button', { name: /sunrise-demo \/ ada/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'New order' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/staff/new-order')
  })

  it('sends the owner of a business whose access ended to the access-ended screen', async () => {
    const { router } = renderApp({ path: '/login/owner' })
    await userEvent.click(await screen.findByRole('button', { name: /Daily Needs Supermarket/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByRole('heading', { name: "Daily Needs Supermarket's access has ended" }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/access-ended')
    expect(screen.getByText(/Access ended on/)).toBeInTheDocument()
  })

  it('sends a turned-off staff member to the turned-off screen', async () => {
    renderApp({ path: '/login/staff' })
    await userEvent.click(await screen.findByRole('button', { name: /sunrise-demo \/ chidi/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByRole('heading', { name: 'This account is turned off' }),
    ).toBeInTheDocument()
  })

  it('shows the demo banner on every screen', async () => {
    renderApp({ path: '/' })
    expect(await screen.findByText('Demo mode: data stays in this browser')).toBeInTheDocument()
  })
})
