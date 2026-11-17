import { describe, it } from 'vitest'
import { DEFAULT_STAFF_EMAIL_DOMAIN } from '@/domain/rules'
import { describeAccountsContract } from '../contract/accounts.contract'
import type { ShopFeature, ShopFixture } from '../contract/orders.contract'
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

/** What Supabase has so far. Contract tests needing anything else are skipped. */
const BUILT: readonly ShopFeature[] = []

/** A fresh "browser": its own signed-in person, kept in memory. */
function browser(): TallyboxApi {
  return createSupabaseApi({
    url,
    publishableKey,
    staffEmailDomain: DEFAULT_STAFF_EMAIL_DOMAIN,
    storage: memorySessionStorage(),
    // Cloudflare's dummy token: accepted only by the always-pass TEST secret on the dev project.
    fallbackCaptchaToken: 'XXXX.DUMMY.TOKEN.XXXX',
    deviceId: () => crypto.randomUUID(),
    isOnline: () => true,
  })
}

/** The developer issues a code, an owner registers with it and adds two staff members. */
async function createShop(): Promise<Omit<ShopFixture, 'api' | 'otherBrowser'>> {
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
  await desk.auth.signOut()

  return { owner, staffA: staff('ada'), staffB: staff('bola') }
}

/** One shop per run, made the first time a test asks for it. */
let shop: ReturnType<typeof createShop> | undefined
const shopFixture = async (): Promise<ShopFixture> => {
  shop ??= createShop()
  return { ...(await shop), api: browser(), otherBrowser: browser }
}

if (ready) {
  describeAccountsContract('supabase', () =>
    Promise.resolve({ api: browser(), otherBrowser: browser, developer }),
  )
  describeOwnerContract('supabase', shopFixture, BUILT)
  describeSuppliesContract('supabase', shopFixture, BUILT)
} else {
  describe('live contract tests', () => {
    it.skip('need .env.local and .env.live.local (see vitest.live.config.ts)', () => undefined)
  })
}
