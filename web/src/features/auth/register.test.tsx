import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createSupabaseApi } from '@/api/supabase'
import { DAY_MS } from '@/domain/access'
import { createTestApi, DEMO, type TestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

/** The developer makes a code for this email, then signs out, as in real life. */
async function codeFor(test: TestApi, email: string, redeemDays = 7) {
  await test.api.auth.signIn(DEMO.developer)
  const code = await test.api.admin.generateActivationCode({
    ownerEmail: email,
    note: 'test',
    redeemDays,
    accessDays: 90,
  })
  await test.api.auth.signOut()
  return code.code
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

function valid(code: string) {
  return {
    'Business name': "Ada's Pharmacy",
    'Business code': 'Adas-Pharmacy',
    'Your full name': 'Ada Obi',
    Email: 'ada@shop.test',
    Password: 'correct-horse',
    'Activation code': code.toLowerCase(),
  }
}

async function openRegister(test: TestApi) {
  const view = renderApp({ path: '/register', api: test.api })
  await screen.findByRole('heading', { name: 'Register your business' })
  return view
}

describe('registration', () => {
  it('registers the business, sends the owner to sign in, and shows it to the developer', async () => {
    const test = createTestApi()
    const code = await codeFor(test, 'ada@shop.test')
    const { router } = await openRegister(test)
    await fill(valid(code))
    expect(await screen.findByText('adas-pharmacy is available')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login/owner'))
    expect(await screen.findByText('Your business is registered')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('ada@shop.test')

    await test.api.auth.signIn(DEMO.developer)
    const businesses = await test.api.admin.listBusinesses()
    expect(businesses.find((business) => business.businessCode === 'adas-pharmacy')).toMatchObject({
      name: "Ada's Pharmacy",
      ownerEmail: 'ada@shop.test',
      status: 'active',
    })
  })

  it('checks the details in the browser before sending anything', async () => {
    const test = createTestApi()
    await openRegister(test)
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
  })

  it('stops a taken business code before the form is sent', async () => {
    const test = createTestApi()
    await openRegister(test)
    await userEvent.type(field('Business code'), 'sunrise-demo')
    expect(
      await screen.findByText('That business code is taken. Choose another.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register business' })).toBeDisabled()
  })

  it('puts a code made for another email on the activation code field', async () => {
    const test = createTestApi()
    const code = await codeFor(test, 'someone.else@shop.test')
    await openRegister(test)
    await fill(valid(code))
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() => expect(field('Activation code')).toBeInvalid())
    expect(field('Activation code')).toHaveAccessibleDescription(
      expect.stringContaining("That activation code doesn't match"),
    )
  })

  it('explains an expired code', async () => {
    const test = createTestApi()
    const code = await codeFor(test, 'ada@shop.test', 1)
    test.advanceTime(2 * DAY_MS)
    await openRegister(test)
    await fill(valid(code))
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() =>
      expect(field('Activation code')).toHaveAccessibleDescription(
        expect.stringContaining('That activation code has expired'),
      ),
    )
  })

  it('puts an email that already has an account on the email field', async () => {
    const test = createTestApi()
    const code = await codeFor(test, DEMO.owner.email)
    await openRegister(test)
    await fill({ ...valid(code), Email: DEMO.owner.email })
    await userEvent.click(screen.getByRole('button', { name: 'Register business' }))

    await waitFor(() =>
      expect(field('Email')).toHaveAccessibleDescription(
        expect.stringContaining('That email already has an account'),
      ),
    )
  })

  it('stays switched off where a bot check is needed but not set up', async () => {
    renderApp({ path: '/register', api: createSupabaseApi() })
    expect(await screen.findByText("Registration isn't switched on yet")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register business' })).toBeDisabled()
  })
})
