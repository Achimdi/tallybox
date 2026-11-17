import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SUPPORT_EMAIL } from '@/lib/config'
import { createTestApi } from '@/test/mockApi'
import { renderApp } from '@/test/render'

/** The pages a front-page link may lead to. */
const PAGES = new Set(['/', '/register', '/login/owner', '/login/staff'])
// The design gallery link only exists in development builds (tests run as development).
if (import.meta.env.DEV) PAGES.add('/dev/gallery')

function openFrontPage() {
  return renderApp({ path: '/', api: createTestApi().api })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the front page', () => {
  it('has no dead links: every section link has its section, every page link a page', async () => {
    const { container } = openFrontPage()
    await screen.findByRole('heading', { level: 1 })

    const links = [...container.ownerDocument.querySelectorAll('a')]
    expect(links.length).toBeGreaterThan(5)
    for (const link of links) {
      const href = link.getAttribute('href') ?? ''
      expect(href, `"${link.textContent}" has no destination`).not.toMatch(/^(#?|javascript:.*)$/)
      if (href.startsWith('#')) {
        expect(
          container.ownerDocument.getElementById(href.slice(1)),
          `"${link.textContent}" points to a missing section ${href}`,
        ).not.toBeNull()
      } else if (href.startsWith('/')) {
        expect(PAGES.has(href), `"${link.textContent}" leads to ${href}`).toBe(true)
      } else {
        throw new Error(`Unexpected link on the front page: ${href}`)
      }
    }
  })

  it('"Ask for a code" opens a way to write that works without an email program', async () => {
    openFrontPage()
    await userEvent.click(await screen.findByRole('button', { name: /Ask for a code/ }))

    const panel = await screen.findByRole('dialog', { name: 'Ask for an activation code' })
    expect(within(panel).getByText(SUPPORT_EMAIL)).toBeInTheDocument()

    const gmail = within(panel).getByRole('link', { name: /Write in Gmail/ })
    const gmailUrl = new URL(gmail.getAttribute('href') ?? '')
    expect(gmailUrl.origin).toBe('https://mail.google.com')
    expect(gmailUrl.searchParams.get('to')).toBe(SUPPORT_EMAIL)
    expect(gmailUrl.searchParams.get('su')).toBe('Tallybox activation code')
    expect(gmailUrl.searchParams.get('body')).toContain('Business name:')
    expect(gmail).toHaveAttribute('target', '_blank')
    expect(gmail).toHaveAttribute('rel', 'noopener noreferrer')

    const mailto = within(panel).getByRole('link', { name: /Open your email app/ })
    expect(mailto.getAttribute('href')).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=Tallybox%20activation%20code&body=Business%20name%3A%0AYour%20name%3A%0APhone%20%28optional%29%3A%0A`,
    )
  })

  it('copies the email address', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    openFrontPage()
    await userEvent.click(await screen.findByRole('button', { name: /Ask for a code/ }))
    const panel = await screen.findByRole('dialog', { name: 'Ask for an activation code' })

    await userEvent.click(within(panel).getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(SUPPORT_EMAIL)
    expect(await screen.findByText('Email address copied')).toBeInTheDocument()
  })

  it('opens the contact panel from the email addresses on the page too', async () => {
    openFrontPage()
    const addresses = await screen.findAllByRole('button', { name: SUPPORT_EMAIL })
    expect(addresses.length).toBe(2)

    await userEvent.click(addresses.at(-1)!)
    const panel = await screen.findByRole('dialog', { name: 'Contact Tallybox' })
    expect(within(panel).getByRole('link', { name: /Write in Gmail/ })).toBeInTheDocument()
  })
})
