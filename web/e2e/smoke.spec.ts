import { expect, test } from '@playwright/test'

/**
 * Smoke tests against the production build. The main flows have their own
 * files (auth, staff, owner, supplies, receipts and reports).
 */

test('the front page offers every way in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Tallybox')
  await expect(page.getByRole('heading', { level: 1, name: /Know your stock/ })).toBeVisible()
  await expect(
    page
      .getByRole('main')
      .getByRole('link', { name: /^Get started/ })
      .first(),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Register your business' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Owner sign in' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Staff sign in' })).toBeVisible()
})

test('the top bar signs in an owner or staff member', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Staff' }).click()
  } else {
    await page.getByRole('banner').getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('menuitem', { name: /Staff/ }).click()
  }
  await expect(page).toHaveURL('/login/staff')
})

test('the page is styled with the brand tokens', async ({ page }) => {
  // Catches a build whose stylesheet is missing its utility classes.
  await page.goto('/')
  const register = page
    .getByRole('main')
    .getByRole('link', { name: /^Get started/ })
    .first()
  await expect(register).toHaveCSS('background-color', 'rgb(14, 124, 123)')
  await expect(register).toHaveCSS('color', 'rgb(255, 255, 255)')
  const box = await register.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(48)
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter Variable/)
})

test('guarded screens send signed-out visitors to the welcome page', async ({ page }) => {
  await page.goto('/owner/dashboard')
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: 'Owner sign in' })).toBeVisible()
})

test('the admin area looks like any missing page', async ({ page }) => {
  await page.goto('/admin/businesses')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('development-only screens are not in the production build', async ({ page }) => {
  await page.goto('/dev/gallery')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByText('Development preview')).toHaveCount(0)
})

test('the app is installable and knows its version', async ({ page, request }) => {
  const manifest = await request.get('/manifest.webmanifest')
  expect(manifest.ok()).toBe(true)
  const manifestJson = (await manifest.json()) as { name: string; display: string }
  expect(manifestJson.name).toBe('Tallybox')
  expect(manifestJson.display).toBe('standalone')

  const version = await request.get('/version.json')
  expect(version.ok()).toBe(true)
  const versionJson = (await version.json()) as { version: string; minVersion: string }
  expect(versionJson.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(versionJson.minVersion).toMatch(/^\d+\.\d+\.\d+$/)

  await page.goto('/')
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.active !== null
  })
  expect(registered).toBe(true)
})

test('shows a banner while offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await context.setOffline(true)
  await expect(page.getByText(/You're offline/)).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText(/You're offline/)).toHaveCount(0)
})
