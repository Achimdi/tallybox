import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTestApi, signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

describe('choosing a new password from a reset link', () => {
  it('says the link has expired when there is no token, with the support address', async () => {
    const test = createTestApi()
    renderApp({ path: '/reset-password', api: test.api })
    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
    expect(screen.getByText(/tallybox3@gmail\.com/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login/owner')
  })

  it('uses the link only when the owner taps Continue, so previews cannot spend it', async () => {
    const test = createTestApi()
    const open = vi.fn(() => Promise.resolve({ email: 'owner@demo.test' }))
    test.api.auth.openPasswordResetLink = open
    renderApp({ path: '/reset-password?token=abc123', api: test.api })

    const proceed = await screen.findByRole('button', { name: 'Continue' })
    expect(open).not.toHaveBeenCalled()
    await userEvent.click(proceed)
    expect(open).toHaveBeenCalledWith('abc123')
    expect(await screen.findByText('For owner@demo.test')).toBeInTheDocument()
  })

  it('says so when the link was already used', async () => {
    const test = createTestApi()
    renderApp({ path: '/reset-password?token=used-up', api: test.api })
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('This link has expired')).toBeInTheDocument()
  })

  it('lets the owner set a new password, then carries on to the dashboard', async () => {
    // Opening the link signed the owner in.
    const test = await signedInTestApi('owner')
    test.api.auth.openPasswordResetLink = () => Promise.resolve({ email: 'owner@demo.test' })
    const complete = vi.fn(() => Promise.resolve())
    test.api.auth.completePasswordReset = complete
    const { router } = renderApp({ path: '/reset-password?token=abc123', api: test.api })

    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('For owner@demo.test')).toBeInTheDocument()
    expect(router.state.location.search).toBe('')

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
