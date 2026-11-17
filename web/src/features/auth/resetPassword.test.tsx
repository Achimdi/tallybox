import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTestApi, signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

describe('choosing a new password from a reset link', () => {
  it('says the link has expired when there is none, with the support address', async () => {
    const test = createTestApi()
    renderApp({ path: '/reset-password', api: test.api })
    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
    expect(screen.getByText(/tallybox3@gmail\.com/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login/owner')
  })

  it('lets the owner set a new password, then carries on to the dashboard', async () => {
    // The link signed the owner in; the backend says it was a reset link.
    const test = await signedInTestApi('owner')
    test.api.auth.readPasswordResetLink = () => Promise.resolve({ email: 'owner@demo.test' })
    const complete = vi.fn(() => Promise.resolve())
    test.api.auth.completePasswordReset = complete
    const { router } = renderApp({ path: '/reset-password', api: test.api })

    expect(await screen.findByText('For owner@demo.test')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('New password again'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('New password'))
    await userEvent.clear(screen.getByLabelText('New password again'))
    await userEvent.type(screen.getByLabelText('New password'), 'brand-new-pass')
    await userEvent.type(screen.getByLabelText('New password again'), 'brand-new-pass')
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }))

    expect(complete).toHaveBeenCalledWith({ newPassword: 'brand-new-pass' })
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/owner/dashboard'))
  })
})
