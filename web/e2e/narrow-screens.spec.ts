import { expect, test, type Page } from '@playwright/test'

/**
 * Nothing scrolls sideways on narrow screens or with large text. A phone with
 * its font or display size turned up makes the page act much narrower than
 * the phone (a 360 px phone at 130% acts like 277 px), so the pages are
 * checked well below normal phone widths.
 */

async function sidewaysScroll(page: Page): Promise<number> {
  // Let the page settle (fonts, previews, charts measuring themselves).
  await page.waitForTimeout(300)
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

async function largeText(page: Page) {
  await page.addStyleTag({ content: 'html { font-size: 150% !important; }' })
}

const PUBLIC_PAGES = ['/', '/login/owner', '/login/staff', '/register', '/privacy', '/support']

test('public pages fit a 260 px screen, and a 320 px one with large text', async ({ page }) => {
  for (const [width, big] of [
    [260, false],
    [320, true],
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    for (const path of PUBLIC_PAGES) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      if (big) await largeText(page)
      expect(await sidewaysScroll(page), `${path} at ${width} px`).toBe(0)
    }
  }
})

test('the owner screens fit a 260 px screen, and a 320 px one with large text', async ({
  page,
}) => {
  await page.goto('/login/owner')
  await page.getByRole('button', { name: /Owner, Sunrise Pharmacy/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')

  for (const [width, big] of [
    [260, false],
    [320, true],
  ] as const) {
    await page.setViewportSize({ width, height: 800 })
    for (const path of [
      '/owner/dashboard',
      '/owner/new-order',
      '/owner/reports',
      '/owner/settings',
    ]) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible()
      if (big) await largeText(page)
      expect(await sidewaysScroll(page), `${path} at ${width} px`).toBe(0)
    }
  }
})
