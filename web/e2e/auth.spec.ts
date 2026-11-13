import { expect, test, type Page } from '@playwright/test'

/**
 * Step 1A in the real production build, on the demo data layer (data kept in
 * this browser). Each test starts with a fresh browser, so fresh demo data.
 */

const PASSWORD = 'demo1234'

async function signInOwnerPortal(page: Page, email: string) {
  await page.goto('/login/owner')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/')
}

test('demo mode is always labelled', async ({ page }) => {
  for (const path of ['/', '/login/owner', '/register']) {
    await page.goto(path)
    await expect(page.getByText('Demo mode: data stays in this browser')).toBeVisible()
  }
})

test('owner login: validates, then signs a demo owner in', async ({ page }) => {
  await page.goto('/login/owner')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter your email.')).toBeVisible()

  await page.getByRole('button', { name: /Owner, Sunrise Pharmacy/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('staff login: signs demo staff in, and turns away a turned-off account', async ({ page }) => {
  await page.goto('/login/staff')
  await page.getByRole('button', { name: /sunrise-demo \/ chidi/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'This account is turned off' })).toBeVisible()

  await page.getByRole('button', { name: 'Back to start' }).click()
  await page.goto('/login/staff')
  await page.getByLabel('Business code').fill('sunrise-demo')
  await page.getByLabel('Username').fill('ada')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Check your business code, username and password',
  )

  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/staff/new-order')
})

test('blocked businesses get their own screens', async ({ page }) => {
  await signInOwnerPortal(page, 'greenleaf@demo.tallybox.test')
  await expect(page).toHaveURL('/suspended')
  await expect(
    page.getByRole('heading', { name: 'Green Leaf Restaurant is suspended' }),
  ).toBeVisible()

  await signInOwnerPortal(page, 'dailyneeds@demo.tallybox.test')
  await expect(page).toHaveURL('/access-ended')
  await expect(
    page.getByRole('heading', { name: "Daily Needs Supermarket's access has ended" }),
  ).toBeVisible()
})

test('activation code flow, end to end', async ({ page }) => {
  // 1. The developer generates a code.
  await signInOwnerPortal(page, 'dev@demo.tallybox.test')
  await expect(page).toHaveURL('/admin/businesses')
  await page.getByRole('link', { name: 'Codes' }).first().click()
  await page.getByRole('link', { name: 'Generate code' }).first().click()
  await page.getByLabel(/^Owner's email/).fill('fresh@client.test')
  await page.getByLabel('Note').fill('Fresh Foods')
  await page.getByRole('radio', { name: '90 days' }).click()
  await page.getByRole('button', { name: 'Generate code' }).click()
  const code =
    (await page.getByText(/^TB-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/).textContent()) ?? ''
  expect(code).toMatch(/^TB-/)
  await page.getByRole('link', { name: 'Done' }).click()
  await expect(page.getByText('fresh@client.test')).toBeVisible()
  await signOut(page)

  // 2. The owner registers with it.
  await page.getByRole('link', { name: 'Register your business' }).click()
  await page.getByLabel(/^Business name/).fill('Fresh Foods')
  await page.getByLabel(/^Business code/).fill('fresh-foods')
  await expect(page.getByText('fresh-foods is available')).toBeVisible()
  await page.getByLabel(/^Your full name/).fill('Funmi Ade')
  await page.getByLabel(/^Email/).fill('fresh@client.test')
  await page.getByLabel(/^Password/).fill('fresh-pass-1')
  await page.getByLabel(/^Activation code/).fill(code.toLowerCase())
  await page.getByRole('button', { name: 'Register business' }).click()

  // 3. The owner signs in.
  await expect(page).toHaveURL('/login/owner')
  await expect(page.getByText('Your business is registered')).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('fresh-pass-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')
  await expect(page.getByText(/business code: fresh-foods/)).toBeVisible()
  await signOut(page)

  // 4. The developer sees it, and the code is used.
  await signInOwnerPortal(page, 'dev@demo.tallybox.test')
  await expect(page.getByRole('link', { name: /Fresh Foods/ })).toContainText('fresh@client.test')
  await page.getByRole('link', { name: 'Codes' }).first().click()
  await expect(page.getByText(/Used by Fresh Foods/)).toBeVisible()

  // 5. Suspend it: the owner is locked out.
  await page.getByRole('link', { name: 'Businesses' }).first().click()
  await page.getByRole('link', { name: /Fresh Foods/ }).click()
  await page.getByLabel('Reason for suspending').fill('Testing')
  await page.getByRole('button', { name: 'Suspend business' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Suspend' }).click()
  await expect(page.getByRole('button', { name: 'Reactivate business' })).toBeVisible()
  await signOut(page)

  await page.goto('/login/owner')
  await page.getByLabel('Email').fill('fresh@client.test')
  await page.getByLabel('Password', { exact: true }).fill('fresh-pass-1')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/suspended')
  await expect(page.getByRole('heading', { name: 'Fresh Foods is suspended' })).toBeVisible()
})

test('registration checks the form in the browser', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel(/^Business code/).fill('My Shop')
  await page.getByLabel(/^Email/).click()
  await expect(page.getByText('Use only lowercase letters, digits and hyphens.')).toBeVisible()
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
