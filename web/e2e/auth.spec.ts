import { expect, test } from '@playwright/test'

/**
 * Phase 1 pages, in the real production build, WITHOUT a Supabase project.
 * These check that each page loads, works on a phone, and fails safely.
 *
 * The full register-then-sign-in flow needs a real Supabase project and is
 * the manual check in README > "Test Phase 1 end to end".
 */

test('owner login: loads, validates, and fails safely without a server', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Owner login' }).click()
  await expect(page.getByRole('heading', { name: 'Owner login' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter your email.')).toBeVisible()

  await page.getByLabel('Email').fill('ada@shop.test')
  await page.getByLabel('Password', { exact: true }).fill('correct-horse')
  await page.getByRole('button', { name: 'Sign in' }).click()
  // This build has no Supabase settings: the person is told plainly.
  await expect(page.getByRole('alert')).toContainText("Tallybox isn't set up yet")
})

test('staff login: three fields and a single generic error style', async ({ page }) => {
  await page.goto('/login/staff')
  await expect(page.getByLabel('Business code')).toBeVisible()
  await expect(page.getByLabel('Username')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByText('Ask the business owner to reset it.')).toBeVisible()
})

test('registration: checks the form in the browser', async ({ page }) => {
  await page.goto('/register')
  await expect(page.getByRole('heading', { name: 'Register your business' })).toBeVisible()
  await page.getByLabel(/^Business code/).fill('My Shop')
  await page.getByLabel(/^Email/).click()
  await expect(page.getByText('Use only lowercase letters, digits and hyphens.')).toBeVisible()
  // Without a Turnstile site key, registration says it is not switched on yet.
  await expect(page.getByText("Registration isn't switched on yet")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register business' })).toBeDisabled()
})

test('forgot password explains the manual reset', async ({ page }) => {
  await page.goto('/login/owner')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await expect(page.getByText('tallybox3@gmail.com')).toBeVisible()
})

test('auth pages fit a phone screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/login/owner', '/login/staff', '/register', '/forgot-password']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
