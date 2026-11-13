import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createTestApi, DEMO, signedInTestApi } from '@/test/mockApi'
import { renderApp, signedInAs } from '@/test/render'

async function fillAndSubmit(name: string, username: string, password: string) {
  await userEvent.type(await screen.findByLabelText(/^Name/), name)
  await userEvent.type(screen.getByLabelText(/^Username/), username)
  await userEvent.type(screen.getByLabelText(/^Temporary password/), password)
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('create staff account', () => {
  it('creates the account, shows what to hand over, and the new person can sign in', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/staff/new', api: test.api })
    await fillAndSubmit('Dayo Ola', ' Dayo ', 'temp-pass-1')

    expect(await screen.findByText('Dayo Ola can now sign in')).toBeInTheDocument()
    expect(screen.getByText('sunrise-demo')).toBeInTheDocument()
    expect(screen.getByText('dayo')).toBeInTheDocument()
    // The password is never shown back.
    expect(screen.queryByText('temp-pass-1')).not.toBeInTheDocument()

    const staffBrowser = test.otherBrowser()
    expect(
      await staffBrowser.auth.signIn({
        portal: 'staff',
        businessCode: 'sunrise-demo',
        username: 'dayo',
        password: 'temp-pass-1',
      }),
    ).toMatchObject({ kind: 'user', user: { role: 'staff', displayName: 'Dayo Ola' } })
  })

  it('checks the username and password before sending', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/staff/new', api: test.api })
    await fillAndSubmit('Chidi', 'c d', 'short')
    expect(await screen.findByText(/Use 3 to 20 lowercase letters or digits/)).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
  })

  it('puts a taken username on the username field', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/owner/staff/new', api: test.api })
    await fillAndSubmit('Another Ada', 'ada', 'temp-pass-1')
    await waitFor(() => expect(screen.getByLabelText(/^Username/)).toBeInvalid())
    expect(screen.getByLabelText(/^Username/)).toHaveAccessibleDescription(
      expect.stringContaining('That username is taken'),
    )
  })

  it('explains when the business was suspended in the meantime', async () => {
    const test = await signedInTestApi('owner')
    const developer = test.otherBrowser()
    await developer.auth.signIn(DEMO.developer)
    renderApp({ path: '/owner/staff/new', api: test.api })
    await screen.findByRole('heading', { name: 'Create staff account' })

    const sunrise = (await developer.admin.listBusinesses()).find(
      (business) => business.businessCode === 'sunrise-demo',
    )
    await developer.admin.setBusinessStatus({
      businessId: sunrise!.id,
      status: 'suspended',
      reason: 'test',
    })

    await fillAndSubmit('Dayo Ola', 'dayo', 'temp-pass-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('This business is suspended')
  })

  it('is not reachable by staff', async () => {
    renderApp({ path: '/owner/staff/new', session: signedInAs('staff'), api: createTestApi().api })
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this" }),
    ).toBeInTheDocument()
  })
})
