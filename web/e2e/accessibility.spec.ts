import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Automated WCAG 2.1 A and AA checks for the screens added after the 1D pass:
 * held orders on New order, the owner reset-link page and staff management.
 */

async function expectAccessible(page: Page) {
  // Check the page as people see it: after the fade-in has finished.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([])
}

test('held orders, opened from New order, pass automated accessibility checks', async ({
  page,
}) => {
  await page.goto('/login/staff')
  await page.getByRole('button', { name: /sunrise-demo \/ ada/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/staff/new-order')

  await page.getByRole('button', { name: /^Held orders/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Held orders' })
  await expect(sheet.getByRole('button', { name: 'Resume' }).first()).toBeVisible()
  await expectAccessible(page)

  // Resume puts the hold in the cart and closes the sheet.
  await sheet.getByRole('button', { name: 'Resume' }).first().click()
  await expect(sheet).toBeHidden()
})

test('the reset-link page passes automated accessibility checks in each state', async ({
  page,
}) => {
  await page.goto('/reset-password?token=pretend')
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
  await expectAccessible(page)

  // Demo links are pretend, so continuing says the link has expired.
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('This link has expired')).toBeVisible()
  await expectAccessible(page)
})

test('staff management passes automated accessibility checks', async ({ page }) => {
  await page.goto('/login/owner')
  await page.getByRole('button', { name: /Owner, Sunrise Pharmacy/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')

  await page.goto('/owner/staff')
  await page.getByRole('link', { name: /Ada Eze/ }).click()
  await expect(page.getByRole('button', { name: 'Set new password' })).toBeVisible()
  await expectAccessible(page)
})

test('the privacy and support pages pass automated accessibility checks', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expectAccessible(page)

  await page.goto('/support')
  await expect(page.getByRole('heading', { level: 1, name: 'Help and support' })).toBeVisible()
  await expectAccessible(page)
})
