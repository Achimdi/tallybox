import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

/** Shared supplies in the production build, with the Green Leaf Restaurant demo. */

async function signInAsGreenLeafOwner(page: Page) {
  await page.goto('/login/owner')
  await page.getByRole('button', { name: /Owner, Green Leaf Restaurant/ }).click()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/owner/dashboard')
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

/** How many of the supply are in stock, read from its page. */
async function bottlesLeft(page: Page): Promise<number> {
  await page.goto('/owner/supplies')
  await page.getByRole('link', { name: /300 ml bottle/ }).click()
  const details = page.getByRole('region', { name: 'Details' })
  await expect(details).toContainText('In stock')
  const text = (await details.locator('dd').first().textContent()) ?? ''
  return Number(text.replace(/\D/g, ''))
}

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

test('drinks sold share the bottles, and a void puts them back', async ({ page }) => {
  test.setTimeout(90_000)
  await signInAsGreenLeafOwner(page)
  const before = await bottlesLeft(page)
  expect(before).toBeGreaterThan(900)

  // Two Coke, one Fanta and one apple juice: four bottles from one shared supply.
  await page.goto('/owner/new-order')
  const coke = page.getByRole('button', { name: /^Add Coke 300ml/ })
  await expect(coke).toContainText(`${before} can be sold`)
  await expect(page.getByRole('button', { name: /^Add Jollof rice/ })).toContainText(
    'No stock count',
  )
  await coke.click()
  await coke.click()
  await page.getByRole('button', { name: /^Add Fanta 300ml/ }).click()
  await page.getByRole('button', { name: /^Add Apple juice 300ml/ }).click()

  const panel = await cart(page)
  await panel.getByRole('radio', { name: 'Cash' }).click()
  await panel.getByRole('checkbox', { name: /Payment received/ }).check()
  await panel.getByRole('button', { name: 'Confirm order' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm order' }).click()
  await expect(page.getByRole('heading', { name: /Order #\d{4} confirmed/ })).toBeVisible()
  const number = (await page.getByRole('heading', { name: /confirmed/ }).textContent())?.match(
    /#\d{4}/,
  )?.[0]

  expect(await bottlesLeft(page)).toBe(before - 4)
  // The supply's history names the order and the item each bottle went to.
  await expect(page.getByText(new RegExp(`for Coke 300ml · order ${number}`))).toBeVisible()
  await expect(page.getByText(new RegExp(`for Fanta 300ml · order ${number}`))).toBeVisible()

  // Voiding returns the bottles.
  await page.goto('/owner/orders')
  await page
    .getByRole('main')
    .getByRole('link', { name: new RegExp(`^${number}`) })
    .click()
  await page.getByRole('button', { name: 'Void order' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel(/^Reason/).fill('Test void')
  await dialog.getByRole('button', { name: 'Void order' }).click()
  await expect(page.getByText(/Reason: Test void/)).toBeVisible()
  expect(await bottlesLeft(page)).toBe(before)
})

test('owner adds a supply and makes an item use it', async ({ page }) => {
  await signInAsGreenLeafOwner(page)
  await page.goto('/owner/supplies')
  await page.getByRole('link', { name: 'Add supply' }).click()
  await page.getByLabel(/^Name/).fill('Takeaway pack')
  await page.getByLabel(/^Unit/).fill('pack')
  await page.getByLabel(/^Opening quantity/).fill('12')
  await page.getByRole('button', { name: 'Add supply' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takeaway pack' })).toBeVisible()

  // Jollof rice counted nothing; now each plate uses one pack.
  await page.goto('/owner/items')
  await page.getByRole('link', { name: /Jollof rice/ }).click()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('checkbox', { name: /Use shared supplies/ }).check()
  await page
    .getByLabel('Supply 1', { exact: true })
    .selectOption({ label: 'Takeaway pack (12 left)' })
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText('12 can be sold')).toBeVisible()
  await expect(page.getByText(/Not counted → Shared supplies: 1 × Takeaway pack/)).toBeVisible()
})

test('supply screens pass automated accessibility checks', async ({ page }) => {
  test.setTimeout(90_000)
  await signInAsGreenLeafOwner(page)
  await page.goto('/owner/supplies')
  await page.getByRole('link', { name: /300 ml bottle/ }).waitFor()
  await expectAccessible(page)

  await page.getByRole('link', { name: /300 ml bottle/ }).click()
  await page.getByRole('heading', { name: 'Used by' }).waitFor()
  await expectAccessible(page)

  await page.goto('/owner/items')
  await page.getByRole('link', { name: /Apple juice 300ml/ }).click()
  await page.getByText('Each one sold uses').waitFor()
  await expectAccessible(page)
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByText('How is stock counted?').waitFor()
  await expectAccessible(page)

  await page.goto('/owner/new-order')
  await page.getByRole('button', { name: /^Add Coke 300ml/ }).waitFor()
  await expectAccessible(page)
})
