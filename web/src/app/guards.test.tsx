import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp, signedInAs } from '@/test/render'

/** The access rules for screens, tested against the real route table. */

describe('signed out', () => {
  it('shows the welcome page with the three ways in', async () => {
    renderApp({ path: '/' })
    expect(await screen.findByRole('heading', { name: 'Tallybox' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Register your business' })).toHaveAttribute(
      'href',
      '/register',
    )
    expect(screen.getByRole('link', { name: 'Owner login' })).toHaveAttribute(
      'href',
      '/login/owner',
    )
    expect(screen.getByRole('link', { name: 'Staff login' })).toHaveAttribute(
      'href',
      '/login/staff',
    )
  })

  it.each(['/staff/new-order', '/owner/dashboard', '/owner/reports'])(
    'sends %s back to the welcome page',
    async (path) => {
      const { router } = renderApp({ path })
      expect(await screen.findByRole('heading', { name: 'Tallybox' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
    },
  )

  it('answers the hidden admin area with "page not found"', async () => {
    renderApp({ path: '/admin/businesses' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(screen.queryByText('Businesses')).not.toBeInTheDocument()
  })

  it('shows "page not found" for unknown addresses', async () => {
    renderApp({ path: '/nope' })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('staff', () => {
  it('lands on New order with the staff navigation', async () => {
    const { router } = renderApp({ path: '/', session: signedInAs('staff') })
    expect(await screen.findByRole('heading', { name: 'New order' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/staff/new-order')
    expect(screen.getAllByRole('link', { name: 'My orders' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('cannot open owner screens', async () => {
    renderApp({ path: '/owner/reports', session: signedInAs('staff') })
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this" }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reports' })).not.toBeInTheDocument()
  })

  it('cannot find the admin area', async () => {
    renderApp({ path: '/admin', session: signedInAs('staff') })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})

describe('owner', () => {
  it('lands on the dashboard with the owner navigation', async () => {
    const { router } = renderApp({ path: '/', session: signedInAs('owner') })
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/owner/dashboard')
    expect(screen.getAllByRole('link', { name: 'Reports' }).length).toBeGreaterThan(0)
  })

  it('cannot find the admin area', async () => {
    renderApp({ path: '/admin/codes', session: signedInAs('owner') })
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('returns to the welcome page after signing out', async () => {
    const { router } = renderApp({ path: '/owner/dashboard', session: signedInAs('owner') })
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('link', { name: 'Owner login' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})

describe('super-admin', () => {
  it('can open the admin area', async () => {
    const { router } = renderApp({ path: '/admin', session: signedInAs('super_admin') })
    expect(await screen.findByRole('heading', { name: 'Businesses' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/businesses')
  })

  it('is not let into a business portal', async () => {
    renderApp({ path: '/owner/dashboard', session: signedInAs('super_admin') })
    expect(
      await screen.findByRole('heading', { name: "You don't have access to this" }),
    ).toBeInTheDocument()
  })
})
