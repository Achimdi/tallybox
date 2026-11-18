import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SUPPORT_INSTAGRAM } from '@/lib/config'
import { createTestApi, signedInTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

describe('privacy page', () => {
  it('says who runs Tallybox, where data is kept, and the rights people have', async () => {
    renderApp({ path: '/privacy', api: createTestApi().api })
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getAllByText(/Nigeria Data Protection Act 2023/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Nigeria Data Protection Commission/)).toBeInTheDocument()
    expect(screen.getByText(/Ireland/)).toBeInTheDocument()
    expect(screen.getByText(/do not sell or rent/)).toBeInTheDocument()

    const instagram = screen.getByRole('link', { name: `@${SUPPORT_INSTAGRAM.handle}` })
    expect(instagram).toHaveAttribute('href', SUPPORT_INSTAGRAM.url)
    expect(instagram).toHaveAttribute('target', '_blank')

    // The email address opens the contact panel, which works without an email program.
    await userEvent.click(screen.getAllByRole('button', { name: /tallybox3@gmail\.com/ })[0]!)
    expect(await screen.findByRole('dialog', { name: 'Contact Tallybox' })).toBeInTheDocument()
  })

  it('opens for someone who is signed in, too', async () => {
    const test = await signedInTestApi('owner')
    renderApp({ path: '/privacy', api: test.api })
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
  })
})

describe('support page', () => {
  it('offers email and Instagram, and the code request', async () => {
    renderApp({ path: '/support', api: createTestApi().api })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Help and support' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Message us on Instagram/ })).toHaveAttribute(
      'href',
      SUPPORT_INSTAGRAM.url,
    )

    await userEvent.click(screen.getByRole('button', { name: /Ask us for an activation code/ }))
    const panel = await screen.findByRole('dialog', { name: 'Ask for an activation code' })
    expect(within(panel).getByRole('link', { name: /Write in Gmail/ })).toBeInTheDocument()
  })

  it('links to registration, both sign-in pages and privacy', async () => {
    renderApp({ path: '/support', api: createTestApi().api })
    await screen.findByRole('heading', { level: 1, name: 'Help and support' })
    for (const [name, href] of [
      ['Get started', '/register'],
      ['Owner login', '/login/owner'],
      ['Staff login', '/login/staff'],
    ] as const) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
    expect(screen.getAllByRole('link', { name: 'Privacy' })[0]).toHaveAttribute('href', '/privacy')
  })
})

describe('registration', () => {
  it('points to support and privacy', async () => {
    renderApp({ path: '/register', api: createTestApi().api })
    expect(await screen.findByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support')
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  })
})
