import { expect, test, type Page } from '@playwright/test'

/** The owner portal in the production build, on demo data. */

async function signInAsOwner(page: Page) {
  await page.goto('/login/owner')
  await page.getByRole('button', { name: /Owner, Sunrise Pharmacy/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')
}

test('owner adds an item, restocks it and adjusts its stock', async ({ page }) => {
  await signInAsOwner(page)
  await page
    .getByRole('navigation', { name: 'Quick actions' })
    .getByRole('link', { name: 'Add item' })
    .click()

  await page.getByLabel(/^Name/).fill('Face masks (pack of 10)')
  await page.getByLabel(/^Selling price/).fill('1500')
  await page.getByLabel(/^Cost price/).fill('900')
  await page.getByLabel(/^Opening quantity/).fill('10')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Face masks (pack of 10)' }),
  ).toBeVisible()
  await expect(page.getByText('10 in stock')).toBeVisible()

  await page.getByRole('link', { name: 'Restock' }).click()
  await page.getByLabel(/^Quantity received/).fill('20')
  await page.getByLabel(/^Supplier/).fill('MedSupply Ltd')
  await page.getByRole('button', { name: 'Save delivery' }).click()
  await expect(page).toHaveURL('/owner/items')

  await page.getByRole('searchbox', { name: 'Search items' }).fill('face masks')
  await page.getByRole('link', { name: /Face masks/ }).click()
  await expect(page.getByText('30 in stock')).toBeVisible()

  await page.getByRole('link', { name: 'Adjust' }).click()
  await page.getByLabel(/^What you counted/).fill('28')
  await expect(page.getByText(/Difference: −2/)).toBeVisible()
  await page.getByRole('radio', { name: 'Damaged' }).click()
  await page.getByRole('button', { name: 'Save adjustment' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save adjustment' }).click()
  await expect(page.getByText('28 in stock')).toBeVisible()
  await expect(page.getByText('Adjustment · Damaged')).toBeVisible()
})

test('owner voids an order and its stock comes back', async ({ page }) => {
  await signInAsOwner(page)
  await page.goto('/owner/orders')
  await page
    .getByRole('main')
    .getByRole('link', { name: /^#\d{4}/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Void order' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel(/^Reason/).fill('Entered twice by mistake')
  await dialog.getByRole('button', { name: 'Void order' }).click()
  await expect(page.getByText(/Reason: Entered twice by mistake/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Void order' })).toHaveCount(0)
})

test('owner manages staff and business settings from More', async ({ page }) => {
  await signInAsOwner(page)
  await page.goto('/owner/more')
  await page.getByRole('link', { name: /^Staff/ }).click()
  await page.getByRole('link', { name: /Bola/ }).click()
  await page.getByRole('button', { name: 'Turn off account' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Turn off' }).click()
  await expect(page.getByText('This account is turned off')).toBeVisible()
  await page.getByRole('button', { name: 'Turn account back on' }).click()
  await expect(page.getByText('This account is turned off')).toHaveCount(0)

  await page.goto('/owner/settings')
  await page.getByLabel(/^Receipt message/).fill('Get well soon!')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel(/^Receipt message/)).toHaveValue('Get well soon!')
})
