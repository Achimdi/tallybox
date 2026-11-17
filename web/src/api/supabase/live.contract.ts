import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STAFF_EMAIL_DOMAIN } from '@/domain/rules'
import { AppError } from '@/lib/errors'
import { describeAccountsContract } from '../contract/accounts.contract'
import {
  describeOrdersContract,
  type ShopFeature,
  type ShopFixture,
} from '../contract/orders.contract'
import { describeOwnerContract } from '../contract/owner.contract'
import { describeSuppliesContract } from '../contract/supplies.contract'
import type { SignInInput, TallyboxApi } from '../types'
import { memorySessionStorage } from './client'
import { createSupabaseApi } from './index'

/**
 * The shared contract tests, against the real Supabase dev project.
 * Run with `npm run test:live` (see vitest.live.config.ts for what it needs).
 *
 * Every run makes its own "Contract Shop" (owner email @contract.test), so
 * runs never depend on each other or on anything typed in by hand.
 */

const url = process.env.VITE_SUPABASE_URL ?? ''
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const developer = {
  email: process.env.TALLYBOX_LIVE_DEV_EMAIL ?? '',
  password: process.env.TALLYBOX_LIVE_DEV_PASSWORD ?? '',
}
const ready = Boolean(url && publishableKey && developer.email && developer.password)

/**
 * Cloudflare's dummy Turnstile token. Only the always-pass TEST secret accepts
 * it, which the dev project uses for registration and sign-in. A project with
 * real keys refuses it: never point these tests at production.
 */
const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'

/** What Supabase has so far: everything, since step 2D. */
const BUILT: readonly ShopFeature[] = [
  'orders',
  'dashboard',
  'reports',
  'staffManagement',
  'settings',
]

/**
 * Supabase allows about 150 password sign-ins per 5 minutes from one address
 * (bursts of 30), and a full run signs in well over a hundred times. When the
 * auth server says "slow down", wait and try again instead of failing. Only
 * sign-in is retried: every limit Tallybox sets itself is still tested as is.
 */
async function signInPatiently(signIn: () => ReturnType<TallyboxApi['auth']['signIn']>) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await signIn()
    } catch (thrown) {
      if (!(thrown instanceof AppError && thrown.code === 'rate_limited') || attempt >= 20) {
        throw thrown
      }
      await new Promise((resolve) => setTimeout(resolve, 15_000))
    }
  }
}

/** A fresh "browser": its own signed-in person, kept in memory. */
function browser(): TallyboxApi {
  const api = createSupabaseApi({
    url,
    publishableKey,
    staffEmailDomain: DEFAULT_STAFF_EMAIL_DOMAIN,
    storage: memorySessionStorage(),
    fallbackCaptchaToken: TEST_CAPTCHA_TOKEN,
    deviceId: () => crypto.randomUUID(),
    isOnline: () => true,
  })
  const auth = api.auth
  return {
    ...api,
    auth: { ...auth, signIn: (input) => signInPatiently(() => auth.signIn(input)) },
  }
}

/**
 * The developer issues a code, an owner registers with it and adds two staff
 * members, then (if asked) two items with plenty of stock.
 */
async function createShop(
  { stocked }: { stocked: boolean } = { stocked: false },
): Promise<Omit<ShopFixture, 'api' | 'otherBrowser'>> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const email = `shop.${id}@contract.test`
  const businessCode = `shop-${id}`.slice(0, 20)

  const desk = browser()
  await desk.auth.signIn({ portal: 'owner', ...developer })
  const code = await desk.admin.generateActivationCode({
    ownerEmail: email,
    note: 'live shop contract',
    redeemDays: 7,
    accessDays: 30,
  })
  await desk.auth.signOut()

  const owner: SignInInput = { portal: 'owner', email, password: 'owner-pass-1' }
  await desk.registration.registerBusiness({
    businessName: 'Contract Shop',
    businessCode,
    ownerName: 'Contract Owner',
    email,
    password: owner.password,
    phone: '',
    activationCode: code.code,
    timezone: 'Africa/Lagos',
  })
  const signedIn = await desk.auth.signIn(owner)
  if (signedIn.kind !== 'user') throw new Error('the new owner could not sign in')
  const staff = (username: string): SignInInput => ({
    portal: 'staff',
    businessCode,
    username,
    password: 'staff-pass-1',
  })
  await desk.staff.create({ displayName: 'Ada', username: 'ada', password: 'staff-pass-1' })
  await desk.staff.create({ displayName: 'Bola', username: 'bola', password: 'staff-pass-1' })
  if (stocked) {
    for (const [name, price] of [
      ['Bread loaf', 120000],
      ['Milk tin', 45000],
    ] as const) {
      await desk.items.upsert({
        itemId: crypto.randomUUID(),
        name,
        category: '',
        unit: '',
        price,
        costPrice: null,
        lowStockLevel: null,
        openingQuantity: 1000,
        tracksOwnStock: true,
        supplies: [],
      })
    }
  }
  await desk.auth.signOut()

  return { owner, staffA: staff('ada'), staffB: staff('bola') }
}

/** A shop made the first time a test asks for it, then shared by that suite's tests. */
function sharedShop(options?: { stocked: boolean }): () => Promise<ShopFixture> {
  let shop: ReturnType<typeof createShop> | undefined
  return async () => {
    shop ??= createShop(options)
    return { ...(await shop), api: browser(), otherBrowser: browser }
  }
}

// Running the business makes its own items. Selling gets a shop of its own
// with two plain items, so it never picks up another test's shared supplies.
const ownerShop = sharedShop()

if (ready) {
  describeAccountsContract('supabase', () =>
    Promise.resolve({ api: browser(), otherBrowser: browser, developer }),
  )
  describeOrdersContract('supabase', sharedShop({ stocked: true }))
  describeOwnerContract('supabase', ownerShop, BUILT)
  describeSuppliesContract('supabase', ownerShop, BUILT)

  // Settings on the Supabase project itself, beyond what the app's own calls show.
  describe('Supabase project settings (live)', () => {
    it('refuses a sign-in that skips the Turnstile check, as a bot would try', async () => {
      const { owner } = await ownerShop()
      if (owner.portal !== 'owner') throw new Error('expected an owner')
      const raw = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { error } = await raw.auth.signInWithPassword({
        email: owner.email,
        password: owner.password,
      })
      expect(error?.code).toBe('captcha_failed')
    })

    it('refuses a password change that skips the current password, even when signed in', async () => {
      const { owner } = await ownerShop()
      if (owner.portal !== 'owner') throw new Error('expected an owner')
      // Someone with a stolen sign-in, calling Supabase directly instead of the app.
      const raw = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const signedIn = await raw.auth.signInWithPassword({
        email: owner.email,
        password: owner.password,
        options: { captchaToken: TEST_CAPTCHA_TOKEN },
      })
      expect(signedIn.error).toBeNull()
      const { error } = await raw.auth.updateUser({ password: 'taken-over-123' })
      expect(error).not.toBeNull()
      const wrong = await raw.auth.updateUser({
        password: 'taken-over-123',
        current_password: 'not-the-password',
      })
      expect(wrong.error).not.toBeNull()
      await raw.auth.signOut()
      // The real password still works.
      expect((await browser().auth.signIn(owner)).kind).toBe('user')
    })
  })
} else {
  describe('live contract tests', () => {
    it.skip('need .env.local and .env.live.local (see vitest.live.config.ts)', () => undefined)
  })
}
