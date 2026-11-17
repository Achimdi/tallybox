import { expect, test, type Locator, type Page } from '@playwright/test'

/** Step 1B: the staff portal in the production build, on demo data. */

async function signInAsAda(page: Page) {
  await page.goto('/login/staff')
  await page.getByRole('button', { name: /sunrise-demo \/ ada/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/staff/new-order')
}

/** The cart: a sheet on phones, a side panel on wider screens. */
async function cart(page: Page): Promise<Locator> {
  const bar = page.getByRole('button', { name: /View cart/ })
  const panel = page.getByRole('complementary', { name: 'Cart and payment' })
  // Wait for the page to show one of them: on a slow machine neither is there yet.
  await expect(bar.or(panel)).toBeVisible()
  if (await bar.isVisible()) {
    await bar.click()
    return page.getByRole('dialog', { name: 'Cart' })
  }
  return panel
}

test('staff take an order from cart to confirmation', async ({ page }) => {
  await signInAsAda(page)
  await page.getByRole('button', { name: /Add Bottled water 75cl/ }).click()
  await page.getByRole('button', { name: /Add Bottled water 75cl/ }).click()
  await page.getByRole('button', { name: /Add Biscuits/ }).click()

  const panel = await cart(page)
  const confirm = panel.getByRole('button', { name: 'Confirm order' })
  await expect(confirm).toBeDisabled()
  await panel.getByRole('radio', { name: 'Cash' }).click()
  await panel.getByRole('checkbox', { name: /Payment received/ }).check()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click()

  await expect(page.getByRole('heading', { name: /Order #\d{4} confirmed/ })).toBeVisible()
  const number = (await page.getByRole('heading', { name: /confirmed/ }).textContent())?.match(
    /#\d{4}/,
  )?.[0]
  expect(number).toBeTruthy()
  await expect(page.getByText('₦800.00')).toBeVisible()

  await page.getByRole('link', { name: 'My orders' }).first().click()
  await expect(page.getByRole('link', { name: new RegExp(number!) })).toBeVisible()
})

test('staff hold an order while waiting for payment, then resume it', async ({ page }) => {
  await signInAsAda(page)
  await page.getByRole('button', { name: /Add Chocolate bar/ }).click()
  const panel = await cart(page)
  await panel.getByRole('button', { name: 'Hold order' }).click()
  await expect(page.getByText('Order held').first()).toBeVisible()

  await page.getByRole('link', { name: 'My orders' }).first().click()
  await page.getByRole('tab', { name: /Held/ }).click()
  const holds = page.getByRole('listitem').filter({ hasText: 'Held order' })
  await holds.first().getByRole('button', { name: 'Resume' }).click()
  await expect(page).toHaveURL('/staff/new-order')
  const resumed = await cart(page)
  await expect(resumed.getByText('Resumed from a held order')).toBeVisible()
})

test('staff items list shows stock, and the profile page works', async ({ page }) => {
  await signInAsAda(page)
  await page.getByRole('link', { name: 'Items' }).first().click()
  await expect(page.getByText('Malaria test kit')).toBeVisible()
  await expect(page.getByText(/cost/i)).toHaveCount(0)

  await page.getByRole('link', { name: 'Profile' }).first().click()
  await expect(page.getByRole('main').getByText('Ada Eze')).toBeVisible()
  await expect(page.getByText('Business code: sunrise-demo')).toBeVisible()
})

test('new order fits a phone screen without sideways scrolling', async ({ page }) => {
  await signInAsAda(page)
  await expect(page.getByRole('button', { name: /Add Biscuits/ })).toBeVisible()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})
