import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

/** Receipts, reports and an accessibility check of the main screens, in the production build. */

async function signIn(page: Page, who: 'owner' | 'staff') {
  if (who === 'owner') {
    await page.goto('/login/owner')
    await page.getByRole('button', { name: /Owner, Sunrise Pharmacy/ }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/owner/dashboard')
  } else {
    await page.goto('/login/staff')
    await page.getByRole('button', { name: /sunrise-demo \/ ada/ }).click()
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL('/staff/new-order')
  }
}

async function download(page: Page, button: string): Promise<{ name: string; bytes: Buffer }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ])
  const path = await file.path()
  return { name: file.suggestedFilename(), bytes: await readFile(path) }
}

/** Fails on any WCAG 2.1 A or AA problem axe can find on the page. */
async function expectAccessible(page: Page) {
  // Check the page as people see it: after the fade-in has finished.
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // A receipt watermark is faint on purpose: pure decoration, hidden from
    // screen readers, which WCAG 1.4.3 exempts from contrast.
    .exclude('[data-testid="receipt-watermark"]')
    .analyze()
  const problems = results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(problems).toEqual([])
}

test('a receipt downloads as a PNG picture and as a PDF, and offers WhatsApp', async ({ page }) => {
  await signIn(page, 'owner')
  await page.goto('/owner/orders')
  await page
    .getByRole('main')
    .getByRole('link', { name: /^#\d{4}/ })
    .first()
    .click()
  const receipt = page.getByRole('region', { name: 'Receipt' })
  await expect(receipt.getByRole('button', { name: 'Share receipt' })).toBeVisible()
  await expect(receipt.getByRole('link', { name: /on WhatsApp$/ })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\//,
  )

  const png = await download(page, 'image')
  expect(png.name).toMatch(/^sunrise-pharmacy-receipt-\d{4}\.png$/)
  expect(png.bytes.subarray(1, 4).toString('latin1')).toBe('PNG')
  // 384 CSS pixels drawn three times over.
  expect(png.bytes.readUInt32BE(16)).toBe(1152)

  const pdf = await download(page, 'PDF')
  expect(pdf.name).toMatch(/\.pdf$/)
  const text = pdf.bytes.toString('latin1')
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  expect(text).toContain('/Filter /DCTDecode')
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
})

test('a voided order still has a receipt, marked VOID in its name', async ({ page }) => {
  await signIn(page, 'owner')
  await page.goto('/owner/orders')
  await page
    .getByRole('main')
    .getByRole('link', { name: /^#\d{4}/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Void order' }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByLabel(/^Reason/).fill('Test')
  await dialog.getByRole('button', { name: 'Void order' }).click()
  await expect(page.getByText(/Reason: Test/)).toBeVisible()
  const png = await download(page, 'image')
  expect(png.name).toMatch(/-void\.png$/)
})

test('reports show figures and export a CSV and a PDF summary', async ({ page }) => {
  await signIn(page, 'owner')
  await page.goto('/owner/reports')
  await page.getByRole('radio', { name: 'This month' }).click()
  await expect(page.getByRole('region', { name: 'Totals' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Best sellers' })).toBeVisible()

  const csv = await download(page, 'Export CSV')
  expect(csv.name).toMatch(/^tallybox-orders-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/)
  const content = csv.bytes.toString('utf8')
  // The file starts with a byte-order mark so Excel reads it as UTF-8.
  expect(content.charCodeAt(0)).toBe(0xfeff)
  const rows = content.slice(1).trimEnd().split('\r\n')
  expect(rows[0]).toBe(
    'Order,Date,Time,Status,Taken by,Payment method,Payment reference,Customer,Item,Quantity,Unit price,Line total,Order total,Void reason',
  )
  expect(rows.length).toBeGreaterThan(5)

  const pdf = await download(page, 'PDF summary')
  expect(pdf.name).toMatch(/^tallybox-report-.*\.pdf$/)
  expect(pdf.bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')
})

test('the main screens pass automated accessibility checks', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expectAccessible(page)
  await page.goto('/login/staff')
  await expectAccessible(page)

  await signIn(page, 'staff')
  await page.getByRole('heading', { name: 'New order' }).waitFor()
  await expectAccessible(page)
  await page.goto('/staff/orders')
  await page.getByRole('tab', { name: /Today/ }).waitFor()
  await expectAccessible(page)
  await page.goto('/staff/profile')
  await expectAccessible(page)
})

test('the owner screens pass automated accessibility checks', async ({ page }) => {
  test.setTimeout(120_000)
  await signIn(page, 'owner')
  for (const [path, ready] of [
    ['/owner/dashboard', 'Sales today'],
    ['/owner/orders', 'Taken by'],
    ['/owner/items', 'Search items'],
    ['/owner/reports', 'Average order'],
    ['/owner/ledger', 'Stock ledger'],
    ['/owner/staff', 'Business code'],
    ['/owner/settings', 'Time zone'],
    ['/owner/more', 'Business settings'],
  ] as const) {
    await page.goto(path)
    await page.getByText(ready).first().waitFor()
    await expectAccessible(page)
  }
})
